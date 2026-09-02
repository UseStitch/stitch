import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { BackgroundTask } from '@stitch/shared/background-tasks/types';
import { extractTextFromParts } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import type { LlmProviderId } from '@stitch/shared/providers/types';

import {
  completeBackgroundTask,
  failBackgroundTask,
  getBackgroundTask,
  insertBackgroundTask,
  interruptStaleBackgroundTasks,
  listBackgroundTasks,
  listRunningBackgroundTasks,
  markBackgroundTaskCancelled,
} from '@/background-tasks/repository.js';
import { scheduleBackgroundTaskResult } from '@/background-tasks/result-delivery.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import type { runStream } from '@/llm/stream/runner.js';
import { abortSessionInteractions } from '@/llm/stream/session-abort.js';
import * as SessionCoordinator from '@/llm/stream/session-run-coordinator.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import type { ModelMessage } from 'ai';

const log = Log.create({ service: 'background-task-service' });
const liveExecutions = new Map<PrefixedString<'ses'>, Promise<void>>();
let acceptingTasks = false;
let pendingStarts = 0;
let pendingStartsDrained: (() => void) | null = null;

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
};

async function scheduleResult(input: StartBackgroundTaskInput): Promise<void> {
  try {
    await Promise.resolve(scheduleBackgroundTaskResult(input.parentSessionId));
  } catch (error) {
    log.error({ event: 'background_task.delivery.failed', taskId: input.taskId, error }, 'result scheduling failed');
  }
}

async function executeBackgroundTask(input: StartBackgroundTaskInput, abortSignal: AbortSignal): Promise<void> {
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
    const settled = await completeBackgroundTask(
      input.taskId,
      extractTextFromParts(assistantMessage?.parts) || 'Task completed.',
    );
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
    SessionCoordinator.cleanup(input.childSessionId);
  }
}

function finishPendingStart(): void {
  pendingStarts--;
  if (pendingStarts === 0) {
    pendingStartsDrained?.();
    pendingStartsDrained = null;
  }
}

function waitForPendingStarts(): Promise<void> {
  if (pendingStarts === 0) return Promise.resolve();
  return new Promise((resolve) => {
    pendingStartsDrained = resolve;
  });
}

function isAcceptingTasks(): boolean {
  return acceptingTasks;
}

export async function initializeBackgroundTaskService(): Promise<void> {
  acceptingTasks = false;
  const interrupted = await interruptStaleBackgroundTasks();
  if (interrupted.length > 0) {
    log.warn(
      { event: 'background_task.interrupted', count: interrupted.length, taskIds: interrupted.map((task) => task.id) },
      'interrupted stale background tasks during startup',
    );
  }
  acceptingTasks = true;
}

export async function shutdownBackgroundTaskService(): Promise<void> {
  acceptingTasks = false;
  await waitForPendingStarts();

  const taskIds = [...liveExecutions.keys()];
  const executions = [...liveExecutions.values()];
  await Promise.all(taskIds.map((taskId) => cancelBackgroundTask(taskId)));
  await Promise.all(executions);
}

export async function startBackgroundTask(input: StartBackgroundTaskInput): Promise<void> {
  if (!isAcceptingTasks()) throw new Error('Background task service is shutting down');

  pendingStarts++;
  try {
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

    if (!isAcceptingTasks()) {
      await markBackgroundTaskCancelled(input.taskId);
      throw new Error('Background task service is shutting down');
    }

    internalBus.emit('background-task.started', { task });
    const abortSignal = SessionCoordinator.register(input.childSessionId);
    const execution = executeBackgroundTask(input, abortSignal)
      .catch((error) => {
        log.error(
          { event: 'background_task.execution.unhandled', taskId: input.taskId, error },
          'detached execution failed',
        );
      })
      .finally(() => {
        liveExecutions.delete(input.taskId);
      });
    liveExecutions.set(input.taskId, execution);
  } finally {
    finishPendingStart();
  }
}

export async function cancelBackgroundTask(taskId: PrefixedString<'ses'>) {
  const existing = await getBackgroundTask(taskId);
  if (!existing || existing.status !== 'running') return existing;

  const cancelled = await markBackgroundTaskCancelled(taskId);
  if (!cancelled) return getBackgroundTask(taskId);

  await abortSessionInteractions(cancelled.childSessionId);
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

export async function listBackgroundTasksForParent(parentSessionId: PrefixedString<'ses'>): Promise<BackgroundTask[]> {
  return listBackgroundTasks(parentSessionId);
}

export async function cancelBackgroundTaskById(taskId: PrefixedString<'ses'>): Promise<BackgroundTask> {
  const task = await cancelBackgroundTask(taskId);
  if (!task) throw new HTTPException(404, { message: 'Background task not found' });
  return task;
}
