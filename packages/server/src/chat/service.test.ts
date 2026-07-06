import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { splitSession } from '@/chat/service.js';
import { archiveSession, listSessionMessages, listSessions } from '@/chat/session-crud.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

function textPart(text: string, time: number): StoredPart {
  return { type: 'text-delta', id: `prt_${time}`, text, startedAt: time, endedAt: time };
}

describe('splitSession', () => {
  test('creates an independent top-level clone session', async () => {
    const sessionId = 'ses_split_source' as never;
    const priorMessageId = 'msg_split_prior' as never;
    const splitMessageId = 'msg_split_user' as never;
    const now = Date.now();

    await getDb()
      .insert(sessions)
      .values({
        id: sessionId,
        title: 'Original',
        type: 'chat',
        automationId: null,
        parentSessionId: null,
        createdAt: now,
        updatedAt: now,
      });

    await getDb()
      .insert(messages)
      .values([
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
    const [clonedSession] = await getDb().select().from(sessions).where(eq(sessions.id, clonedSessionId));
    expect(clonedSession.parentSessionId).toBeNull();

    const clonedMessages = await getDb().select().from(messages).where(eq(messages.sessionId, clonedSessionId));
    expect(clonedMessages).toHaveLength(1);
    expect(clonedMessages[0].parts).toEqual([textPart('Earlier context', now - 2)]);
  });

  test('ignores archived messages when cloning prior context', async () => {
    const sessionId = 'ses_split_archived_source' as never;
    const archivedMessageId = 'msg_split_archived_prior' as never;
    const liveMessageId = 'msg_split_live_prior' as never;
    const splitMessageId = 'msg_split_archived_user' as never;
    const now = Date.now();

    await getDb()
      .insert(sessions)
      .values({
        id: sessionId,
        title: 'Original',
        type: 'chat',
        automationId: null,
        parentSessionId: null,
        createdAt: now,
        updatedAt: now,
      });

    await getDb()
      .insert(messages)
      .values([
        {
          id: archivedMessageId,
          sessionId,
          role: 'assistant',
          parts: [textPart('Archived context', now - 3)],
          modelId: 'test-model',
          providerId: 'test-provider',
          costUsd: 0,
          finishReason: 'stop',
          isSummary: false,
          archivedAt: now,
          archivedReason: 'redo',
          createdAt: now - 3,
          updatedAt: now - 3,
          startedAt: now - 3,
          duration: 0,
        },
        {
          id: liveMessageId,
          sessionId,
          role: 'assistant',
          parts: [textPart('Live context', now - 2)],
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
    const clonedSessionId = result.data!.session.id;
    const clonedMessages = await getDb().select().from(messages).where(eq(messages.sessionId, clonedSessionId));

    expect(clonedMessages).toHaveLength(1);
    expect(clonedMessages[0].parts).toEqual([textPart('Live context', now - 2)]);
  });
});

describe('listSessionMessages', () => {
  test('excludes archived messages', async () => {
    const sessionId = 'ses_list_archived' as never;
    const liveMessageId = 'msg_list_live' as never;
    const archivedMessageId = 'msg_list_archived' as never;
    const now = Date.now();

    await getDb()
      .insert(sessions)
      .values({
        id: sessionId,
        title: 'Messages',
        type: 'chat',
        automationId: null,
        parentSessionId: null,
        createdAt: now,
        updatedAt: now,
      });

    await getDb()
      .insert(messages)
      .values([
        {
          id: archivedMessageId,
          sessionId,
          role: 'user',
          parts: [textPart('Archived', now - 1)],
          modelId: 'test-model',
          providerId: 'test-provider',
          costUsd: 0,
          finishReason: null,
          isSummary: false,
          archivedAt: now,
          archivedReason: 'redo',
          createdAt: now - 1,
          updatedAt: now - 1,
          startedAt: now - 1,
          duration: null,
        },
        {
          id: liveMessageId,
          sessionId,
          role: 'user',
          parts: [textPart('Live', now)],
          modelId: 'test-model',
          providerId: 'test-provider',
          costUsd: 0,
          finishReason: null,
          isSummary: false,
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          duration: null,
        },
      ]);

    const result = await listSessionMessages(sessionId);

    expect(result.error).toBeNull();
    expect(result.data?.messages.map((message) => message.id)).toEqual([liveMessageId]);
  });
});

describe('listSessions', () => {
  test('excludes archived chat sessions', async () => {
    const visibleSessionId = 'ses_list_visible_session' as never;
    const archivedSessionId = 'ses_list_archived_session' as never;
    const now = Date.now();

    await getDb()
      .insert(sessions)
      .values([
        {
          id: visibleSessionId,
          title: 'Archive Filter Visible',
          type: 'chat',
          automationId: null,
          parentSessionId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: archivedSessionId,
          title: 'Archive Filter Archived',
          type: 'chat',
          automationId: null,
          parentSessionId: null,
          createdAt: now - 1,
          updatedAt: now - 1,
        },
      ]);

    const archiveResult = await archiveSession(archivedSessionId);
    const result = await listSessions('chat', { search: 'Archive Filter' });

    expect(archiveResult.error).toBeNull();
    expect(archiveResult.data?.archivedReason).toBe('archive_session');
    expect(result.error).toBeNull();
    expect(result.data?.sessions.map((session) => session.id)).toEqual([visibleSessionId]);
  });
});
