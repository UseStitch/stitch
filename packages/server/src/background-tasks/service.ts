import { and, eq } from 'drizzle-orm';

import type { BackgroundTask } from '@stitch/shared/background-tasks/types';
import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import type { LlmProviderId } from '@stitch/shared/providers/types';

import {
  completeBackgroundTask,
  failBackgroundTask,
  getBackgroundTask,
  insertBackgroundTask,
  listBackgroundTasks,
  listRunningBackgroundTasks,
  markBackgroundTaskCancelled,
} from '@/background-tasks/repository.js';
import { scheduleBackgroundTaskResult } from '@/background-tasks/result-delivery.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { err, ok, type ServiceResult } from '@/lib/service-result.js';
import { cancelDecision } from '@/llm/stream/doom-loop.js';
import type { runStream } from '@/llm/stream/runner.js';
import { abortMcpElicitations } from '@/mcp/elicitation-service.js';
import { abortPermissionResponses } from '@/permission/service.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import { abortQuestions } from '@/question/service.js';
import type { ModelMessage } from 'ai';

const log = Log.create({ service: 'background-task-service' });

type StartBackgroundTaskInput = {
  taskId: PrefixedString<'ses'>;
  parentSessionId: PrefixedString<'ses'>;
  childSessionId: PrefixedString<'ses'>;
  childAssistantMessageId: PrefixedString<'msg'>;
  originMessageId: PrefixedString<'msg'>;
  originToolCallId: string;
  title: string;
  providerId: LlmProviderId;
  modelId: string;
  credentials: LlmProviderCredentials;
  activeToolsetIds: string[];
  llmMessages: ModelMessage[];
  run: typeof runStream;
  scheduleResult?: (parentSessionId: PrefixedString<'ses'>) => void | Promise<void>;
};

type BackgroundTaskServiceDependencies = {
  registerAbort: typeof AbortRegistry.register;
  cleanupAbort: typeof AbortRegistry.cleanup;
};

const defaultDependencies: BackgroundTaskServiceDependencies = {
  registerAbort: AbortRegistry.register,
  cleanupAbort: AbortRegistry.cleanup,
};

function extractAssistantText(parts: StoredPart[] | undefined): string {
  const text = parts
    ?.filter(
      (part): part is StoredPart & { type: 'text-delta'; text: string } =>
        part.type === 'text-delta' && typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => part.text)
    .join('');
  return text || 'Task completed.';
}

async function scheduleResult(input: StartBackgroundTaskInput): Promise<void> {
  try {
    (input.scheduleResult ?? scheduleBackgroundTaskResult)(input.parentSessionId);
  } catch (error) {
    log.error({ event: 'background_task.delivery.failed', taskId: input.taskId, error }, 'result scheduling failed');
  }
}

async function executeBackgroundTask(
  input: StartBackgroundTaskInput,
  abortSignal: AbortSignal,
  deps: BackgroundTaskServiceDependencies,
): Promise<void> {
  try {
    await input.run({
      sessionId: input.childSessionId,
      assistantMessageId: input.childAssistantMessageId,
      modelId: input.modelId,
      llmMessages: input.llmMessages,
      credentials: input.credentials,
      abortSignal,
      activeToolsetIds: input.activeToolsetIds,
      allowTaskTool: false,
      excludedToolsetIds: ['browser'],
    });

    const assistantMessage = (
      await getDb()
        .select({ parts: messages.parts })
        .from(messages)
        .where(and(eq(messages.sessionId, input.childSessionId), eq(messages.id, input.childAssistantMessageId)))
    ).at(0);
    const settled = await completeBackgroundTask(input.taskId, extractAssistantText(assistantMessage?.parts));
    if (!settled) return;

    internalBus.emit('background-task.completed', { task: settled });
    await scheduleResult(input);
  } catch (error) {
    const message = Error.isError(error) ? error.message : 'Unknown error';
    const settled = await failBackgroundTask(input.taskId, message);
    if (!settled) return;

    internalBus.emit('background-task.failed', { task: settled });
    await scheduleResult(input);
  } finally {
    deps.cleanupAbort(input.childSessionId);
  }
}

export async function startBackgroundTask(
  input: StartBackgroundTaskInput,
  dependencies: BackgroundTaskServiceDependencies = defaultDependencies,
): Promise<void> {
  const task = await insertBackgroundTask({
    id: input.taskId,
    parentSessionId: input.parentSessionId,
    childSessionId: input.childSessionId,
    originMessageId: input.originMessageId,
    originToolCallId: input.originToolCallId,
    title: input.title,
    providerId: input.providerId,
    modelId: input.modelId,
    activeToolsetIds: input.activeToolsetIds,
  });
  internalBus.emit('background-task.started', { task });

  const abortSignal = dependencies.registerAbort(input.childSessionId);
  const execution = executeBackgroundTask(input, abortSignal, dependencies);
  void execution.catch((error) => {
    log.error(
      { event: 'background_task.execution.unhandled', taskId: input.taskId, error },
      'detached execution failed',
    );
  });
}

export async function cancelBackgroundTask(taskId: PrefixedString<'ses'>) {
  const existing = await getBackgroundTask(taskId);
  if (!existing || existing.status !== 'running') return existing;

  const cancelled = await markBackgroundTaskCancelled(taskId);
  if (!cancelled) return getBackgroundTask(taskId);

  AbortRegistry.abort(cancelled.childSessionId);
  cancelDecision(cancelled.childSessionId);
  await Promise.all([
    abortQuestions(cancelled.childSessionId),
    abortPermissionResponses(cancelled.childSessionId),
    abortMcpElicitations(cancelled.childSessionId),
  ]);
  internalBus.emit('background-task.cancelled', { task: cancelled });
  return cancelled;
}

export async function cancelBackgroundTasksForParent(parentSessionId: PrefixedString<'ses'>): Promise<void> {
  const pendingParents = [parentSessionId];
  while (pendingParents.length > 0) {
    const parentId = pendingParents.shift();
    if (!parentId) break;
    const tasks = await listRunningBackgroundTasks(parentId);
    pendingParents.push(...tasks.map((task) => task.childSessionId));
    await Promise.all(tasks.map((task) => cancelBackgroundTask(task.id)));
  }
}

export async function listBackgroundTasksForParent(
  parentSessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<BackgroundTask[]>> {
  return ok(await listBackgroundTasks(parentSessionId));
}

export async function cancelBackgroundTaskById(taskId: PrefixedString<'ses'>): Promise<ServiceResult<BackgroundTask>> {
  const task = await cancelBackgroundTask(taskId);
  return task ? ok(task) : err('Background task not found', 404);
}
