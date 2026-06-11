import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { SseEventPayloadMap } from '@stitch/shared/realtime';

import { saveAssistantMessage, markSessionUnread, saveTitleMessage } from '@/chat/message-store.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import * as Events from '@/lib/events.js';
import { ZERO_USAGE } from '@/utils/usage.js';

setupTestDb();

async function seedSession(id: string): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(sessions)
    .values({
      id: id as never,
      title: 'Test session',
      type: 'chat',
      automationId: null,
      parentSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
}

describe('saveAssistantMessage', () => {
  test('inserts an assistant message row with correct fields', async () => {
    const sessionId = 'ses_test_save_1' as never;
    const assistantMessageId = 'msg_test_save_1' as never;
    await seedSession(sessionId);

    const startedAt = Date.now() - 500;
    await saveAssistantMessage({
      sessionId,
      assistantMessageId,
      modelId: 'test-model',
      providerId: 'test-provider',
      accumulatedParts: [
        { type: 'text-delta', id: 'p1', text: 'Hello', startedAt, endedAt: startedAt } as never,
      ],
      totalUsage: { ...ZERO_USAGE, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finalFinishReason: 'stop',
      startedAt,
    });

    const rows = await getDb().select().from(messages).where(eq(messages.id, assistantMessageId));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.role).toBe('assistant');
    expect(row.sessionId).toBe(sessionId);
    expect(row.modelId).toBe('test-model');
    expect(row.providerId).toBe('test-provider');
    expect(row.finishReason).toBe('stop');
    expect(row.startedAt).toBe(startedAt);
    expect(typeof row.duration).toBe('number');
    expect(row.duration).toBeGreaterThanOrEqual(0);
  });

  test('emits stream-finish event with correct payload', async () => {
    const sessionId = 'ses_test_save_2' as never;
    const assistantMessageId = 'msg_test_save_2' as never;
    await seedSession(sessionId);

    const emitted: SseEventPayloadMap['stream-finish'][] = [];
    const cleanup = Events.on('stream-finish', (data) => emitted.push(data));

    const startedAt = Date.now();
    await saveAssistantMessage({
      sessionId,
      assistantMessageId,
      modelId: 'test-model',
      providerId: 'test-provider',
      accumulatedParts: [],
      totalUsage: { ...ZERO_USAGE, inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finalFinishReason: 'error',
      startedAt,
    });

    cleanup();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      sessionId,
      messageId: assistantMessageId,
      finishReason: 'error',
    });
  });
});

describe('markSessionUnread', () => {
  test('sets isUnread=true on the session', async () => {
    const sessionId = 'ses_test_unread_1' as never;
    await seedSession(sessionId);

    const [before] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(before.isUnread).toBe(false);

    await markSessionUnread(sessionId);

    const [after] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(after.isUnread).toBe(true);
  });
});

describe('saveTitleMessage', () => {
  test('inserts a title message row with correct fields', async () => {
    const sessionId = 'ses_test_title_1' as never;
    const messageId = 'msg_test_title_1' as never;
    await seedSession(sessionId);

    const createdAt = Date.now();
    const titlePart = {
      type: 'session-title',
      id: 'p1',
      title: 'My Title',
      startedAt: createdAt,
      endedAt: createdAt,
    } as never;

    await saveTitleMessage({
      sessionId,
      messageId,
      modelId: 'test-model',
      providerId: 'test-provider',
      parts: [titlePart],
      usage: { ...ZERO_USAGE, inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      costUsd: 0.0001,
      createdAt,
    });

    const rows = await getDb().select().from(messages).where(eq(messages.id, messageId));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.role).toBe('assistant');
    expect(row.finishReason).toBe('stop');
    expect(row.isSummary).toBe(false);
    expect(row.costUsd).toBeCloseTo(0.0001, 6);
    expect(row.startedAt).toBe(createdAt);
    expect(row.duration).toBe(0);
  });
});
