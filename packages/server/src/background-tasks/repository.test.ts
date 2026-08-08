import { describe, expect, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

import {
  claimPendingBackgroundTasks,
  completeBackgroundTask,
  failBackgroundTask,
  getBackgroundTask,
  insertBackgroundTask,
  interruptStaleBackgroundTasks,
  listBackgroundTasks,
  markBackgroundTaskCancelled,
  markBackgroundTaskClaimsDelivered,
  markBackgroundTaskInterrupted,
  releaseBackgroundTaskClaims,
} from '@/background-tasks/repository.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

const parentSessionId = 'ses_background_parent' as PrefixedString<'ses'>;
const childSessionId = 'ses_background_child' as PrefixedString<'ses'>;
const originMessageId = 'msg_background_origin' as PrefixedString<'msg'>;

async function insertTask(): Promise<void> {
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
      providerId: 'provider',
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      duration: null,
    });
  await insertBackgroundTask({
    id: childSessionId,
    parentSessionId,
    childSessionId,
    originMessageId,
    originToolCallId: 'tool-call',
    title: 'Child',
    providerId: 'provider',
    modelId: 'model',
    activeToolsetIds: ['github'],
    startedAt: now,
  });
}

describe('background task repository', () => {
  test('inserts and completes a running task once', async () => {
    await insertTask();

    const completed = await completeBackgroundTask(childSessionId, 'finished');
    const secondSettlement = await failBackgroundTask(childSessionId, 'too late');

    expect(completed?.status).toBe('completed');
    expect(completed?.result).toBe('finished');
    expect(completed?.completedAt).toBeNumber();
    expect(secondSettlement).toBeNull();
    expect((await getBackgroundTask(childSessionId))?.status).toBe('completed');
    expect(await listBackgroundTasks(parentSessionId)).toHaveLength(1);
  });

  test('cancellation wins against later completion', async () => {
    await insertTask();

    const cancelled = await markBackgroundTaskCancelled(childSessionId);
    const completion = await completeBackgroundTask(childSessionId, 'too late');

    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.deliveryStatus).toBe('not-applicable');
    expect(completion).toBeNull();
  });

  test('claims, releases, and delivers pending results conditionally', async () => {
    await insertTask();
    await completeBackgroundTask(childSessionId, 'finished');
    const firstDeliveryId = 'msg_delivery_first' as PrefixedString<'msg'>;
    const secondDeliveryId = 'msg_delivery_second' as PrefixedString<'msg'>;

    expect(await claimPendingBackgroundTasks(parentSessionId, firstDeliveryId)).toHaveLength(1);
    expect(await claimPendingBackgroundTasks(parentSessionId, secondDeliveryId)).toHaveLength(0);

    await releaseBackgroundTaskClaims(firstDeliveryId);
    expect(await claimPendingBackgroundTasks(parentSessionId, secondDeliveryId)).toHaveLength(1);

    await markBackgroundTaskClaimsDelivered(secondDeliveryId);
    expect(await claimPendingBackgroundTasks(parentSessionId, firstDeliveryId)).toHaveLength(0);
    expect((await getBackgroundTask(childSessionId))?.deliveryStatus).toBe('delivered');
  });

  test('interrupts stale running tasks and prevents another terminal transition', async () => {
    await insertTask();

    const interrupted = await interruptStaleBackgroundTasks();

    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].status).toBe('interrupted');
    expect(interrupted[0].deliveryStatus).toBe('not-applicable');
    expect(await markBackgroundTaskInterrupted(childSessionId)).toBeNull();
  });
});
