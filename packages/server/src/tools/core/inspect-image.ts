import fs from 'node:fs/promises';
import path from 'node:path';

import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { createSession } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';
import { buildCompactedHistory } from '@/llm/compaction.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { runStream } from '@/llm/stream/runner.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const log = Log.create({ service: 'inspect-image-tool' });

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const DESCRIPTION = `Inspect an image using vision capabilities. Reads a local image file and sends it to the LLM with a prompt describing what to analyze.

Use this tool when you need to:
- Understand the contents of a screenshot, diagram, or photo
- Extract text or data from an image (OCR)
- Analyze UI mockups, charts, or visual layouts
- Compare visual elements or identify patterns

The image is sent to a child session with vision capabilities. Returns the LLM's analysis as a summary.

Supported formats: PNG, JPG, JPEG, GIF, WEBP, SVG, BMP.`;

type InspectImageToolDeps = {
  parentSessionId: PrefixedString<'ses'>;
  parentAbortSignal: AbortSignal;
  credentials: ProviderCredentials;
  modelId: string;
  providerId: string;
};

export function createInspectImageTool(context: ToolContext, deps: InspectImageToolDeps) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      imagePath: z.string().describe('Absolute path to the image file to inspect'),
      prompt: z.string().describe('What to analyze or look for in the image'),
    }),
    execute: async ({ imagePath, prompt }, { toolCallId }) => {
      const ext = path.extname(imagePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return {
          childSessionId: null,
          childSessionName: null,
          summary: `Unsupported image format "${ext}". Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
        };
      }

      let stat;
      try {
        stat = await fs.stat(imagePath);
      } catch {
        return {
          childSessionId: null,
          childSessionName: null,
          summary: `Image file not found: ${imagePath}`,
        };
      }

      if (stat.size > MAX_FILE_SIZE) {
        return {
          childSessionId: null,
          childSessionName: null,
          summary: `Image file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum supported size is 20MB.`,
        };
      }

      const mime = MIME_MAP[ext] ?? 'application/octet-stream';
      const buffer = await fs.readFile(imagePath);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const filename = path.basename(imagePath);
      const sessionTitle = `Inspect: ${filename}`.slice(0, 50);

      const sessionResult = await createSession({
        title: sessionTitle,
        parentSessionId: deps.parentSessionId,
      });
      if (isServiceError(sessionResult)) {
        return {
          childSessionId: null,
          childSessionName: null,
          summary: `Failed to create inspection session: ${sessionResult.error}`,
        };
      }
      const childSession = sessionResult.data;
      const childSessionId = childSession.id;

      Events.emit('stream-tool-state', {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId,
        toolName: 'inspect_image',
        status: 'in-progress',
        output: {
          childSessionId,
          childSessionName: childSession.title,
        },
      });

      log.info(
        {
          event: 'inspect_image.child_session.created',
          parentSessionId: deps.parentSessionId,
          childSessionId,
          imagePath,
          promptPreview: prompt.slice(0, 200),
        },
        'child session created for image inspection',
      );

      const now = Date.now();
      const userMessageId = createMessageId();

      const parts: StoredPart[] = [
        {
          type: 'text-delta',
          id: createPartId(),
          text: prompt,
          startedAt: now,
          endedAt: now,
        },
        {
          type: 'user-image',
          id: createPartId(),
          dataUrl,
          mime,
          filename,
          startedAt: now,
          endedAt: now,
        },
      ];

      const db = getDb();
      await db.insert(messages).values({
        id: userMessageId,
        sessionId: childSessionId,
        role: 'user',
        parts,
        modelId: deps.modelId,
        providerId: deps.providerId,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        duration: null,
      });

      const llmMessages = await buildCompactedHistory(childSessionId);
      const assistantMessageId = createMessageId();

      const childAbortSignal = AbortRegistry.register(childSessionId);
      const onParentAbort = () => {
        AbortRegistry.abort(childSessionId);
      };
      deps.parentAbortSignal.addEventListener('abort', onParentAbort, { once: true });

      try {
        await runStream({
          sessionId: childSessionId,
          assistantMessageId,
          modelId: deps.modelId,
          llmMessages,
          credentials: deps.credentials,
          abortSignal: childAbortSignal,
          activeToolsetIds: [],
          allowTaskTool: false,
        });

        log.info(
          {
            event: 'inspect_image.child_session.completed',
            parentSessionId: deps.parentSessionId,
            childSessionId,
          },
          'image inspection completed',
        );

        const childMessages = await db
          .select()
          .from(messages)
          .where(and(eq(messages.sessionId, childSessionId), eq(messages.id, assistantMessageId)));

        const assistantMessage = childMessages[0];
        let summary = 'Image inspection completed.';

        if (assistantMessage?.parts) {
          const textParts = assistantMessage.parts
            .filter(
              (p: StoredPart): p is StoredPart & { type: 'text-delta'; text: string } =>
                p.type === 'text-delta' && typeof (p as { text?: unknown }).text === 'string',
            )
            .map((p: { text: string }) => p.text);
          if (textParts.length > 0) {
            summary = textParts.join('');
          }
        }

        return { childSessionId, childSessionName: childSession.title, summary };
      } catch (error) {
        log.error(
          {
            event: 'inspect_image.child_session.failed',
            parentSessionId: deps.parentSessionId,
            childSessionId,
            error,
          },
          'image inspection failed',
        );

        return {
          childSessionId,
          childSessionName: childSession.title,
          summary: `Image inspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      } finally {
        deps.parentAbortSignal.removeEventListener('abort', onParentAbort);
        AbortRegistry.cleanup(childSessionId);
      }
    },
  });
}
