import { describe, expect, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

import { completeBackgroundTask, insertBackgroundTask } from '@/background-tasks/repository.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { chatRouter } from '@/routes/chat.js';

setupTestDb();

const parentSessionId = 'ses_route_parent' as PrefixedString<'ses'>;
const originMessageId = 'msg_route_origin' as PrefixedString<'msg'>;

async function setupTasks(): Promise<[PrefixedString<'ses'>, PrefixedString<'ses'>]> {
  const olderId = 'ses_route_older' as PrefixedString<'ses'>;
  const newerId = 'ses_route_newer' as PrefixedString<'ses'>;
  await getDb()
    .insert(sessions)
    .values([
      { id: parentSessionId, title: 'Parent', createdAt: 1, updatedAt: 1 },
      { id: olderId, title: 'Older', parentSessionId, createdAt: 1, updatedAt: 1 },
      { id: newerId, title: 'Newer', parentSessionId, createdAt: 2, updatedAt: 2 },
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
      createdAt: 1,
      updatedAt: 1,
      startedAt: 1,
      duration: null,
    });

  for (const [id, startedAt] of [
    [olderId, 1],
    [newerId, 2],
  ] as const) {
    await insertBackgroundTask({
      id,
      parentSessionId,
      childSessionId: id,
      originMessageId,
      originToolCallId: `call-${id}`,
      title: id,
      providerId: 'provider',
      modelId: 'model',
      activeToolsetIds: [],
      startedAt,
    });
  }
  return [olderId, newerId];
}

describe('background task chat routes', () => {
  test('lists newest first and cancelling a terminal task is idempotent', async () => {
    const [olderId, newerId] = await setupTasks();
    await completeBackgroundTask(olderId, 'done');

    const listResponse = await chatRouter.request(`/sessions/${parentSessionId}/background-tasks`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as { id: string }[];
    expect(listed.map((task) => task.id)).toEqual([newerId, olderId]);

    const cancelResponse = await chatRouter.request(`/background-tasks/${olderId}/cancel`, { method: 'POST' });
    expect(cancelResponse.status).toBe(200);
    expect(((await cancelResponse.json()) as { status: string }).status).toBe('completed');
  });

  test('returns 404 when cancelling an unknown task', async () => {
    const response = await chatRouter.request('/background-tasks/ses_route_missing/cancel', { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
