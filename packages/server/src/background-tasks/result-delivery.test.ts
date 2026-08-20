import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { asc, eq } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { completeBackgroundTask, getBackgroundTask, insertBackgroundTask } from '@/background-tasks/repository.js';
import { scheduleBackgroundTaskResult } from '@/background-tasks/result-delivery.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import * as resolveModel from '@/llm/resolve-model.js';
import * as sessionHistory from '@/llm/session-history.js';
import * as streamRunner from '@/llm/stream/runner.js';
import { enqueueSessionRun } from '@/llm/stream/session-run-coordinator.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import * as providerConfig from '@/provider/config/service.js';
import type { ModelMessage } from 'ai';

setupTestDb();

const parentSessionId = 'ses_delivery_parent' as PrefixedString<'ses'>;
const credentials = { providerId: 'openai', auth: { method: 'api-key', apiKey: 'test' } } as LlmProviderCredentials;

const validateProviderModel = spyOn(resolveModel, 'validateProviderModel');
const getProviderCredentials = spyOn(providerConfig, 'getProviderCredentials');
const buildSessionLlmMessages = spyOn(sessionHistory, 'buildSessionLlmMessages');
const runStream = spyOn(streamRunner, 'runStream');

beforeEach(() => {
  validateProviderModel.mockImplementation(async () => undefined);
  getProviderCredentials.mockImplementation(async () => credentials);
  buildSessionLlmMessages.mockImplementation(async () => []);
  runStream.mockImplementation(async () => undefined);
});

afterAll(() => {
  validateProviderModel.mockRestore();
  getProviderCredentials.mockRestore();
  buildSessionLlmMessages.mockRestore();
  runStream.mockRestore();
});

async function insertCompletedTask(suffix: string, result = `result ${suffix}`): Promise<PrefixedString<'ses'>> {
  const childSessionId = `ses_delivery_child_${suffix}` as PrefixedString<'ses'>;
  const originMessageId = `msg_delivery_origin_${suffix}` as PrefixedString<'msg'>;
  const now = Date.now();
  await getDb()
    .insert(sessions)
    .values({ id: childSessionId, title: suffix, parentSessionId, createdAt: now, updatedAt: now });
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
      duration: 0,
    });
  await insertBackgroundTask({
    id: childSessionId,
    parentSessionId,
    childSessionId,
    originMessageId,
    originToolCallId: `tool-${suffix}`,
    title: suffix,
    providerId: 'openai',
    modelId: 'model',
    activeToolsetIds: [],
  });
  await completeBackgroundTask(childSessionId, result);
  return childSessionId;
}

async function setupParent(): Promise<void> {
  const now = Date.now();
  await getDb().insert(sessions).values({ id: parentSessionId, title: 'Parent', createdAt: now, updatedAt: now });
}

async function storedMessages(): Promise<Array<{ id: PrefixedString<'msg'>; parts: StoredPart[] }>> {
  return getDb()
    .select({ id: messages.id, parts: messages.parts })
    .from(messages)
    .where(eq(messages.sessionId, parentSessionId))
    .orderBy(asc(messages.createdAt));
}

describe('background task result delivery', () => {
  test('waits behind a busy parent and rebuilds history after durable insertion', async () => {
    await setupParent();
    const taskId = await insertCompletedTask('busy');
    const busy = Promise.withResolvers<void>();
    const busyStarted = Promise.withResolvers<void>();
    const delivered = Promise.withResolvers<void>();
    void enqueueSessionRun(parentSessionId, async () => {
      busyStarted.resolve();
      await busy.promise;
    });
    await busyStarted.promise;

    let historyMessageIds: string[] = [];
    buildSessionLlmMessages.mockImplementation(async () => {
      historyMessageIds = (await storedMessages()).map((message) => message.id);
      return [{ role: 'user', content: 'rebuilt' }] as ModelMessage[];
    });
    runStream.mockImplementation(async () => {
      delivered.resolve();
      return undefined;
    });

    scheduleBackgroundTaskResult(parentSessionId);
    await Bun.sleep(0);
    expect((await getBackgroundTask(taskId))?.deliveryStatus).toBe('pending');

    busy.resolve();
    await delivered.promise;
    expect((await getBackgroundTask(taskId))?.deliveryStatus).toBe('delivered');
    const synthetic = (await storedMessages()).find((message) =>
      message.parts.some((part) => part.type === 'background-task-result'),
    );
    expect(synthetic).toBeDefined();
    if (synthetic) expect(historyMessageIds).toContain(synthetic.id);
  });

  test('coalesces pending results and duplicate schedules into one message and wake-up', async () => {
    await setupParent();
    const firstTask = await insertCompletedTask('one');
    const secondTask = await insertCompletedTask('two');
    const woke = Promise.withResolvers<void>();
    let wakeUps = 0;

    buildSessionLlmMessages.mockImplementation(async () => [{ role: 'user', content: 'rebuilt' }]);
    runStream.mockImplementation(async () => {
      wakeUps++;
      woke.resolve();
    });

    scheduleBackgroundTaskResult(parentSessionId);
    scheduleBackgroundTaskResult(parentSessionId);
    await woke.promise;
    await Bun.sleep(0);

    const synthetic = (await storedMessages()).filter((message) =>
      message.parts.some((part) => part.type === 'background-task-result'),
    );
    expect(synthetic).toHaveLength(1);
    const part = synthetic[0].parts.find((item) => item.type === 'background-task-result');
    expect(new Set(part?.tasks.map((task) => task.taskId))).toEqual(new Set([firstTask, secondTask]));
    expect(wakeUps).toBe(1);
  });

  test('releases claims when provider setup fails before insertion', async () => {
    await setupParent();
    const taskId = await insertCompletedTask('setup-failure');
    const failed = Promise.withResolvers<void>();

    getProviderCredentials.mockImplementation(async () => {
      failed.resolve();
      throw new Error('Provider missing');
    });

    scheduleBackgroundTaskResult(parentSessionId);
    await failed.promise;
    await Bun.sleep(0);

    expect((await getBackgroundTask(taskId))?.deliveryStatus).toBe('pending');
    expect(
      (await storedMessages()).some((message) => message.parts.some((part) => part.type === 'background-task-result')),
    ).toBe(false);
  });

  test('stops safely if the parent is deleted before queued delivery starts', async () => {
    await setupParent();
    await insertCompletedTask('deleted');
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    void enqueueSessionRun(parentSessionId, async () => {
      started.resolve();
      await gate.promise;
    });
    await started.promise;

    let wakeUps = 0;
    runStream.mockImplementation(async () => {
      wakeUps++;
    });
    scheduleBackgroundTaskResult(parentSessionId);
    await getDb().delete(sessions).where(eq(sessions.parentSessionId, parentSessionId));
    await getDb().delete(sessions).where(eq(sessions.id, parentSessionId));
    gate.resolve();
    await Bun.sleep(0);
    await Bun.sleep(0);

    expect(wakeUps).toBe(0);
  });
});
