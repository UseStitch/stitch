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
import * as Log from '@/lib/log.js';
import { buildCompactedHistory } from '@/llm/compaction.js';
import { runStream } from '@/llm/stream/runner.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import type { ToolsetManager } from '@/tools/toolsets/manager.js';

const log = Log.create({ service: 'task-tool' });

const TASK_DESCRIPTION = `Spawn a child session to handle a task independently with its own context window.

Use this tool for:
- Context-heavy work (research, comparison, planning, or multi-step execution)
- Independent subtasks that benefit from a dedicated context window
- Work that can be parallelized or isolated

The child session inherits your active toolsets and permissions.
Keep task descriptions detailed and specific - the child session starts fresh with only the task description.
The child session can ask questions and request permissions from the user, just like you can.

Returns a summary of the completed work. You can also link the user to the child session for full details.`;

type TaskToolDeps = {
  parentSessionId: PrefixedString<'ses'>;
  parentAbortSignal: AbortSignal;
  credentials: ProviderCredentials;
  modelId: string;
  providerId: string;
  toolsetManager: ToolsetManager;
};

export function createTaskTool(context: ToolContext, deps: TaskToolDeps) {
  return tool({
    description: TASK_DESCRIPTION,
    inputSchema: z.object({
      task: z.string().describe('Detailed description of the task to accomplish'),
      toolsets: z
        .array(z.string())
        .optional()
        .describe('Additional toolset IDs to activate in the child session beyond inherited ones'),
    }),
    execute: async ({ task, toolsets: additionalToolsets }) => {
      const childSession = await createSession({
        title: task.slice(0, 100),
        parentSessionId: deps.parentSessionId,
      });

      const childSessionId = childSession.id;

      log.info(
        {
          event: 'task.child_session.created',
          parentSessionId: deps.parentSessionId,
          childSessionId,
          taskPreview: task.slice(0, 200),
        },
        'child session created for task tool',
      );

      // Insert a user message with the task prompt
      const userMessageId = createMessageId();
      const now = Date.now();
      const taskPart: StoredPart = {
        type: 'text-delta',
        id: createPartId(),
        text: task,
        startedAt: now,
        endedAt: now,
      };

      const db = getDb();
      await db.insert(messages).values({
        id: userMessageId,
        sessionId: childSessionId,
        role: 'user',
        parts: [taskPart],
        modelId: deps.modelId,
        providerId: deps.providerId,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        duration: null,
      });

      // Build history (just the system prompt + user message)
      const llmMessages = await buildCompactedHistory(childSessionId);
      const assistantMessageId = createMessageId();

      // Create a child abort controller linked to the parent
      const childAbortSignal = AbortRegistry.register(childSessionId);

      // Cascade parent abort to child
      const onParentAbort = () => {
        AbortRegistry.abort(childSessionId);
      };
      deps.parentAbortSignal.addEventListener('abort', onParentAbort, { once: true });

      // Compute toolset IDs to pre-activate in child session
      const inheritedToolsetIds = [...deps.toolsetManager.getActiveIds()];
      const allToolsetIds = [...new Set([...inheritedToolsetIds, ...(additionalToolsets ?? [])])];

      try {
        await runStream({
          sessionId: childSessionId,
          assistantMessageId,
          modelId: deps.modelId,
          llmMessages,
          credentials: deps.credentials,
          abortSignal: childAbortSignal,
          activeToolsetIds: allToolsetIds,
        });

        log.info(
          {
            event: 'task.child_session.completed',
            parentSessionId: deps.parentSessionId,
            childSessionId,
          },
          'child session task completed',
        );

        // Extract the summary from the child's assistant message
        const childMessages = await db
          .select()
          .from(messages)
          .where(and(eq(messages.sessionId, childSessionId), eq(messages.id, assistantMessageId)));

        const assistantMessage = childMessages[0];
        let summary = 'Task completed.';

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

        return {
          childSessionId,
          childSessionName: childSession.title,
          summary,
        };
      } catch (error) {
        log.error(
          {
            event: 'task.child_session.failed',
            parentSessionId: deps.parentSessionId,
            childSessionId,
            error,
          },
          'child session task failed',
        );

        return {
          childSessionId,
          childSessionName: childSession.title,
          summary: `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      } finally {
        deps.parentAbortSignal.removeEventListener('abort', onParentAbort);
        AbortRegistry.cleanup(childSessionId);
      }
    },
  });
}
