import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { splitSession } from '@/chat/service.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

function textPart(text: string, time: number): StoredPart {
  return {
    type: 'text-delta',
    id: `prt_${time}`,
    text,
    startedAt: time,
    endedAt: time,
  };
}

describe('splitSession', () => {
  test('creates an independent top-level clone session', async () => {
    const sessionId = 'ses_split_source' as never;
    const priorMessageId = 'msg_split_prior' as never;
    const splitMessageId = 'msg_split_user' as never;
    const now = Date.now();

    await getDb().insert(sessions).values({
      id: sessionId,
      title: 'Original',
      type: 'chat',
      automationId: null,
      parentSessionId: null,
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(messages).values([
      {
        id: priorMessageId,
        sessionId,
        role: 'assistant',
        parts: [textPart('Earlier context', now - 2)],
        modelId: 'test-model',
        providerId: 'test-provider',
        costUsd: 0,
        finishReason: 'stop',
        isSummary: false,
        createdAt: now - 2,
        updatedAt: now - 2,
        startedAt: now - 2,
        duration: 0,
      },
      {
        id: splitMessageId,
        sessionId,
        role: 'user',
        parts: [textPart('Continue from here', now - 1)],
        modelId: 'test-model',
        providerId: 'test-provider',
        costUsd: 0,
        finishReason: null,
        isSummary: false,
        createdAt: now - 1,
        updatedAt: now - 1,
        startedAt: now - 1,
        duration: null,
      },
    ]);

    const result = await splitSession(sessionId, splitMessageId);

    expect(result.error).toBeNull();
    expect(result.data?.prefillText).toBe('Continue from here');
    expect(result.data?.session.parentSessionId).toBeNull();

    const clonedSessionId = result.data!.session.id;
    const [clonedSession] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, clonedSessionId));
    expect(clonedSession.parentSessionId).toBeNull();

    const clonedMessages = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.sessionId, clonedSessionId));
    expect(clonedMessages).toHaveLength(1);
    expect(clonedMessages[0].parts).toEqual([textPart('Earlier context', now - 2)]);
  });
});
