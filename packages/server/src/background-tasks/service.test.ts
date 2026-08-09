import { describe, expect, test } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getBackgroundTask } from '@/background-tasks/repository.js';
import { cancelBackgroundTask, startBackgroundTask } from '@/background-tasks/service.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';

setupTestDb();

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
  scheduleResult?: (parentId: PrefixedString<'ses'>) => void,
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
        (parentId) => scheduled.push(parentId),
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

    await startBackgroundTask(
      input(async () => streamGate.promise),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    const cancelled = await cancelBackgroundTask(childSessionId);
    streamGate.resolve();
    await Bun.sleep(0);

    expect(cancelled?.status).toBe('cancelled');
    expect((await getBackgroundTask(childSessionId))?.status).toBe('cancelled');
  });

  test('persists a stream failure before emitting the failed event', async () => {
    await setupSessions();
    const failedEvent = Promise.withResolvers<void>();
    const unsubscribe = internalBus.on('background-task.failed', async ({ task }) => {
      expect((await getBackgroundTask(task.id))?.error).toBe('stream failed');
      failedEvent.resolve();
    });

    await startBackgroundTask(
      input(async () => {
        throw new Error('stream failed');
      }),
      { registerAbort: () => new AbortController().signal, cleanupAbort: () => undefined },
    );
    await failedEvent.promise;
    unsubscribe();

    expect((await getBackgroundTask(childSessionId))?.status).toBe('error');
  });
});
