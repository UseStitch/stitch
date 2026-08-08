import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { extractTextFromParts, type StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { LlmProviderId } from '@stitch/shared/providers/types';

import { cancelBackgroundTask, startBackgroundTask } from '@/background-tasks/service.js';
import { createSession } from '@/chat/session-crud.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { runStream } from '@/llm/stream/runner.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import type { ToolsetManager } from '@/tools/toolsets/manager.js';

const log = Log.create({ service: 'task-tool' });
const CHILD_SESSION_EXCLUDED_TOOLSETS = ['browser'];

export const TASK_DESCRIPTION = `Spawn a child session to handle a task independently with its own context window.

Use this tool for:
- Context-heavy work (research, comparison, planning, or multi-step execution)
- Independent subtasks that benefit from a dedicated context window
- Work that can be parallelized or isolated

The child session inherits your active toolsets and permissions.
Provide a concise title (30 chars max) and a detailed task description - the child session starts fresh with only what you provide.
The child session can ask questions and request permissions from the user, just like you can.

Set background to true only for independent work. Background mode returns immediately and the result arrives automatically.
Do not poll, sleep, ask for status, duplicate delegated work, or modify overlapping files. Continue only with non-overlapping work.
The child starts with only the supplied task and inherited tools. Its output is not directly shown to the user; summarize it after notification.

Returns a summary of the completed work. You can also link the user to the child session for full details.`;

type TaskToolDeps = {
  parentSessionId: PrefixedString<'ses'>;
  parentAbortSignal: AbortSignal;
  credentials: LlmProviderCredentials;
  modelId: string;
  providerId: LlmProviderId;
  toolsetManager: ToolsetManager;
};

export function createTaskTool(context: ToolContext, deps: TaskToolDeps) {
  return tool({
    description: TASK_DESCRIPTION,
    inputSchema: z.object({
      title: z.string().trim().min(1).max(30).describe('Short task title for the child session (30 chars max)'),
      task: z.string().describe('Detailed description of the task to accomplish'),
      background: z
        .boolean()
        .optional()
        .describe('Run independently and report back automatically. Do not poll for status.'),
      toolsets: z
        .array(z.string())
        .optional()
        .describe('Additional toolset IDs to activate in the child session beyond inherited ones'),
    }),
    execute: async ({ title, task, background, toolsets: additionalToolsets }, { toolCallId }) => {
      const sessionResult = await createSession({ title, parentSessionId: deps.parentSessionId });
      if (sessionResult.error) {
        return {
          childSessionId: null,
          childSessionName: null,
          summary: `Task failed: could not create child session — ${sessionResult.error.message}`,
        };
      }
      const childSession = sessionResult.data;

      const childSessionId = childSession.id;

      internalBus.emit('tool.progress', {
        sessionId: context.sessionId,
        messageId: context.messageId,
        toolCallId,
        toolName: 'task',
        output: { childSessionId, childSessionName: childSession.title },
      });

      log.info(
        { event: 'task.child_session.created', parentSessionId: deps.parentSessionId, childSessionId },
        'child session created for task tool',
      );

      // Insert a user message with the task prompt
      const userMessageId = createMessageId();
      const now = Date.now();
      const taskPart: StoredPart = { type: 'text-delta', id: createPartId(), text: task, startedAt: now, endedAt: now };

      const db = getDb();
      await db
        .insert(messages)
        .values({
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
      const llmMessages = await buildSessionLlmMessages(childSessionId, { useBasePrompt: true, systemPrompt: null });
      const assistantMessageId = createMessageId();
      const inheritedToolsetIds = [...deps.toolsetManager.getActiveIds()];
      const allToolsetIds = [...new Set([...inheritedToolsetIds, ...(additionalToolsets ?? [])])];

      if (background) {
        try {
          await db
            .insert(messages)
            .values({
              id: context.messageId,
              sessionId: deps.parentSessionId,
              role: 'assistant',
              parts: [],
              modelId: deps.modelId,
              providerId: deps.providerId,
              costUsd: 0,
              createdAt: now,
              updatedAt: now,
              startedAt: now,
              duration: null,
            })
            .onConflictDoNothing();

          await startBackgroundTask({
            taskId: childSessionId,
            parentSessionId: deps.parentSessionId,
            childSessionId,
            childAssistantMessageId: assistantMessageId,
            originMessageId: context.messageId,
            originToolCallId: toolCallId,
            title,
            providerId: deps.providerId,
            modelId: deps.modelId,
            credentials: deps.credentials,
            activeToolsetIds: allToolsetIds,
            llmMessages,
            run: runStream,
          });
          if (deps.parentAbortSignal.aborted) await cancelBackgroundTask(childSessionId);

          return {
            taskId: childSessionId,
            childSessionId,
            childSessionName: childSession.title,
            status: 'running' as const,
            summary: 'Background task started. You will be notified automatically when it finishes.',
          };
        } catch (error) {
          return {
            childSessionId,
            childSessionName: childSession.title,
            summary: `Task failed: ${Error.isError(error) ? error.message : 'Unknown error'}`,
          };
        }
      }

      // Create a child abort controller linked to the parent
      const childAbortSignal = AbortRegistry.register(childSessionId);

      // Cascade parent abort to child
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
          activeToolsetIds: allToolsetIds,
          allowTaskTool: false,
          excludedToolsetIds: CHILD_SESSION_EXCLUDED_TOOLSETS,
        });

        log.info(
          { event: 'task.child_session.completed', parentSessionId: deps.parentSessionId, childSessionId },
          'child session task completed',
        );

        // Extract the summary from the child's assistant message
        const childMessages = await db
          .select()
          .from(messages)
          .where(and(eq(messages.sessionId, childSessionId), eq(messages.id, assistantMessageId)));

        const assistantMessage = childMessages.at(0);
        const summary = extractTextFromParts(assistantMessage?.parts) || 'Task completed.';

        return { childSessionId, childSessionName: childSession.title, summary };
      } catch (error) {
        log.error(
          { event: 'task.child_session.failed', parentSessionId: deps.parentSessionId, childSessionId, error },
          'child session task failed',
        );

        return {
          childSessionId,
          childSessionName: childSession.title,
          summary: `Task failed: ${Error.isError(error) ? error.message : 'Unknown error'}`,
        };
      } finally {
        deps.parentAbortSignal.removeEventListener('abort', onParentAbort);
        AbortRegistry.cleanup(childSessionId);
      }
    },
  });
}
