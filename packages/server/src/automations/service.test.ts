import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';

import { deleteAutomation } from '@/automations/service.js';
import { getDb } from '@/db/client.js';
import { automations } from '@/db/schema/automations.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

async function insertAutomationWithSession(input: { automationId: string; sessionId: string }) {
  const now = Date.now();
  await getDb()
    .insert(automations)
    .values({
      id: input.automationId as never,
      providerId: 'test-provider',
      modelId: 'test-model',
      title: 'Daily report',
      initialMessage: 'Write a daily report',
      schedule: null,
      createdAt: now,
      updatedAt: now,
    });
  await getDb()
    .insert(sessions)
    .values({
      id: input.sessionId as never,
      title: 'Daily report #1',
      type: 'automation',
      automationId: input.automationId as never,
      parentSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
}

describe('deleteAutomation', () => {
  test('deletes automation sessions by default', async () => {
    const automationId = 'auto_delete_sessions';
    const sessionId = 'ses_delete_sessions';
    await insertAutomationWithSession({ automationId, sessionId });

    const result = await deleteAutomation(automationId);

    const sessionRows = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId as never));
    expect(result.error).toBeNull();
    expect(sessionRows).toEqual([]);
  });

  test('archives automation sessions when requested', async () => {
    const automationId = 'auto_delete_archive';
    const sessionId = 'ses_delete_archive';
    await insertAutomationWithSession({ automationId, sessionId });

    const result = await deleteAutomation(automationId, { archiveSessions: true });

    const [session] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId as never));
    expect(result.error).toBeNull();
    expect(session.automationId).toBeNull();
    expect(session.archivedAt).toBeNumber();
    expect(session.archivedReason).toBe(ARCHIVE_REASONS.automationDeleted);
  });
});
