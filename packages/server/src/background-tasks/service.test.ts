import { beforeEach, describe, expect, test } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getBackgroundTask, insertBackgroundTask } from '@/background-tasks/repository.js';
import {
  cancelBackgroundTask,
  initializeBackgroundTaskService,
  shutdownBackgroundTaskService,
  startBackgroundTask,
} from '@/background-tasks/service.js';
import { archiveSession, deleteSession } from '@/chat/session-crud.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';

setupTestDb();

beforeEach(async () => {
  await initializeBackgroundTaskService();
});

const parentSessionId = 'ses_service_parent' as PrefixedString<'ses'>;
const childSessionId = 'ses_service_child' as PrefixedString<'ses'>;
const originMessageId = 'msg_service_origin' as PrefixedString<'msg'>;
const assistantMessageId = 'msg_service_assistant' as PrefixedString<'msg'>;

async function setupSessions(): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(sessions)
    .values([
      { id: parentSessionId, title: 'Parent', createdAt: now, updatedAt: now },
      { id: childSessionId, title: 'Child', parentSessionId, createdAt: now, updatedAt: now },
    ]);
  await getDb()
    .insert(messages)
    .values({
      id: originMessageId,
      sessionId: parentSessionId,
      role: 'assistant',
      parts: [],
      modelId: 'model',
      providerId: 'openai',
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      duration: null,
    });
}

function input(
  run: Parameters<typeof startBackgroundTask>[0]['run'],
  scheduleResult?: (parentId: PrefixedString<'ses'>) => void | Promise<void>,
) {
  return {
    taskId: childSessionId,
    parentSessionId,
    childSessionId,
    childAssistantMessageId: assistantMessageId,
    originMessageId,
    originToolCallId: 'tool-call',
    title: 'Child',
    providerId: 'openai' as const,
    modelId: 'model',
    credentials: { providerId: 'openai', auth: { method: 'api-key', apiKey: 'test' } } as LlmProviderCredentials,
    activeToolsetIds: ['github'],
    llmMessages: [],
    run,
    scheduleResult,
  };
}

describe('background task service', () => {
  test('returns after durable start and settles completion in the detached execution', async () => {
    await setupSessions();
    const streamGate = Promise.withResolvers<void>();
    const completedEvent = Promise.withResolvers<void>();
    const scheduled: PrefixedString<'ses'>[] = [];
    const unsubscribe = internalBus.on('background-task.completed', async ({ task }) => {
      expect((await getBackgroundTask(task.id))?.status).toBe('completed');
      completedEvent.resolve();
    });

    await startBackgroundTask(
      input(
        async () => {
          await streamGate.promise;
          const now = Date.now();
          const part: StoredPart = {
            type: 'text-delta',
            id: 'prt_service_result',
            text: 'child result',
            startedAt: now,
            endedAt: now,
          };
          await getDb()
            .insert(messages)
            .values({
              id: assistantMessageId,
              sessionId: childSessionId,
              role: 'assistant',
              parts: [part],
              modelId: 'model',
              providerId: 'openai',
              costUsd: 0,
              createdAt: now,
              updatedAt: now,
              startedAt: now,
              duration: 0,
            });
        },
        (parentId) => {
          scheduled.push(parentId);
        },
      ),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );

    expect((await getBackgroundTask(childSessionId))?.status).toBe('running');
    streamGate.resolve();
    await completedEvent.promise;
    unsubscribe();

    expect((await getBackgroundTask(childSessionId))?.result).toBe('child result');
    expect(scheduled).toEqual([parentSessionId]);
  });

  test('cancellation remains terminal when detached execution finishes later', async () => {
    await setupSessions();
    const streamGate = Promise.withResolvers<void>();
    const scheduled: PrefixedString<'ses'>[] = [];

    await startBackgroundTask(
      input(
        async () => streamGate.promise,
        (parentId) => {
          scheduled.push(parentId);
        },
      ),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    const cancelled = await cancelBackgroundTask(childSessionId);
    streamGate.resolve();
    await Bun.sleep(0);

    expect(cancelled?.status).toBe('cancelled');
    expect((await getBackgroundTask(childSessionId))?.status).toBe('cancelled');
    expect(scheduled).toEqual([]);
  });

  test('persists a stream failure before emitting the failed event', async () => {
    await setupSessions();
    const failedEvent = Promise.withResolvers<void>();
    const scheduled: PrefixedString<'ses'>[] = [];
    const unsubscribe = internalBus.on('background-task.failed', async ({ task }) => {
      expect((await getBackgroundTask(task.id))?.error).toBe('stream failed');
      failedEvent.resolve();
    });

    await startBackgroundTask(
      input(
        async () => {
          throw new Error('stream failed');
        },
        (parentId) => {
          scheduled.push(parentId);
        },
      ),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    await failedEvent.promise;
    unsubscribe();

    expect((await getBackgroundTask(childSessionId))?.status).toBe('error');
    expect(scheduled).toEqual([parentSessionId]);
  });

  test('keeps a completed task settled when result scheduling fails asynchronously', async () => {
    await setupSessions();
    const completedEvent = Promise.withResolvers<void>();
    const unsubscribe = internalBus.on('background-task.completed', async () => completedEvent.resolve());

    await startBackgroundTask(
      input(
        async () => undefined,
        async () => {
          throw new Error('delivery unavailable');
        },
      ),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    await completedEvent.promise;
    await Bun.sleep(0);
    unsubscribe();

    expect((await getBackgroundTask(childSessionId))?.status).toBe('completed');
  });

  test('reconciles stale tasks without emitting lifecycle events', async () => {
    await setupSessions();
    await shutdownBackgroundTaskService();
    await insertBackgroundTask({
      id: childSessionId,
      parentSessionId,
      childSessionId,
      originMessageId,
      originToolCallId: 'tool-call',
      title: 'Child',
      providerId: 'openai',
      modelId: 'model',
      activeToolsetIds: [],
    });

    const events: string[] = [];
    const unsubscribe = internalBus.on('background-task.interrupted', async () => {
      events.push('interrupted');
    });
    await initializeBackgroundTaskService();
    unsubscribe();

    const task = await getBackgroundTask(childSessionId);
    expect(task?.status).toBe('interrupted');
    expect(task?.deliveryStatus).toBe('not-applicable');
    expect(task?.completedAt).toBeNumber();
    expect(events).toEqual([]);
  });

  test('shutdown rejects new launches until initialization resets the service', async () => {
    await setupSessions();
    await shutdownBackgroundTaskService();

    expect(startBackgroundTask(input(async () => undefined))).rejects.toThrow(
      'Background task service is shutting down',
    );
    expect(await getBackgroundTask(childSessionId)).toBeNull();

    await initializeBackgroundTaskService();
    await startBackgroundTask(
      input(async () => undefined),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    await Bun.sleep(0);
    expect((await getBackgroundTask(childSessionId))?.status).toBe('completed');
  });

  test('shutdown cancels and aborts live child streams before returning', async () => {
    await setupSessions();
    let childSignal: AbortSignal | undefined;
    await startBackgroundTask(
      input(async ({ abortSignal }) => {
        childSignal = abortSignal;
        await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      }),
    );

    await shutdownBackgroundTaskService();

    expect(childSignal?.aborted).toBeTrue();
    expect((await getBackgroundTask(childSessionId))?.status).toBe('cancelled');
  });

  test('deleting a parent aborts live descendants before cascading their rows', async () => {
    await setupSessions();
    let childSignal: AbortSignal | undefined;
    await startBackgroundTask(
      input(async ({ abortSignal }) => {
        childSignal = abortSignal;
        await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      }),
    );

    await deleteSession(parentSessionId);

    expect(childSignal?.aborted).toBeTrue();
    expect(await getBackgroundTask(childSessionId)).toBeNull();
  });

  test('archiving a parent cancels live descendants', async () => {
    await setupSessions();
    let childSignal: AbortSignal | undefined;
    await startBackgroundTask(
      input(async ({ abortSignal }) => {
        childSignal = abortSignal;
        await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      }),
    );

    await archiveSession(parentSessionId);

    expect(childSignal?.aborted).toBeTrue();
    expect((await getBackgroundTask(childSessionId))?.status).toBe('cancelled');
  });
});
