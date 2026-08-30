import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';

import { deleteAutomation, listAutomations } from '@/automations/service.js';
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

    await deleteAutomation(automationId);

    const sessionRows = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId as never));
    expect(sessionRows).toEqual([]);
  });

  test('archives automation sessions when requested', async () => {
    const automationId = 'auto_delete_archive';
    const sessionId = 'ses_delete_archive';
    await insertAutomationWithSession({ automationId, sessionId });

    await deleteAutomation(automationId, { archiveSessions: true });

    const [session] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId as never));
    expect(session.automationId).toBeNull();
    expect(session.archivedAt).toBeNumber();
    expect(session.archivedReason).toBe(ARCHIVE_REASONS.automationDeleted);
  });
});

describe('listAutomations', () => {
  test('sorts globally before pagination and uses id as the directional tie-breaker', async () => {
    await getDb()
      .insert(automations)
      .values([
        {
          id: 'auto_a' as never,
          providerId: 'provider',
          modelId: 'model',
          title: 'A',
          initialMessage: 'A',
          updatedAt: 10,
          createdAt: 1,
        },
        {
          id: 'auto_b' as never,
          providerId: 'provider',
          modelId: 'model',
          title: 'B',
          initialMessage: 'B',
          updatedAt: 20,
          createdAt: 2,
        },
        {
          id: 'auto_c' as never,
          providerId: 'provider',
          modelId: 'model',
          title: 'C',
          initialMessage: 'C',
          updatedAt: 20,
          createdAt: 3,
        },
      ]);

    const firstPage = await listAutomations({ page: 1, pageSize: 2, sort: 'updatedAt', sortDirection: 'desc' });
    const secondPage = await listAutomations({ page: 2, pageSize: 2, sort: 'updatedAt', sortDirection: 'desc' });

    expect(firstPage.automations.map((automation) => automation.id)).toEqual(['auto_c', 'auto_b']);
    expect(secondPage.automations.map((automation) => automation.id)).toEqual(['auto_a']);
  });

  test('continues beyond the first 100 rows', async () => {
    await getDb()
      .insert(automations)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          id: `auto_${String(index).padStart(3, '0')}` as never,
          providerId: 'provider',
          modelId: 'model',
          title: `Automation ${index}`,
          initialMessage: 'Run',
          createdAt: index,
          updatedAt: index,
        })),
      );

    const result = await listAutomations({ page: 2, pageSize: 100, sort: 'createdAt', sortDirection: 'asc' });

    expect(result.automations.map((automation) => automation.id)).toEqual(['auto_100']);
    expect(result.totalPages).toBe(2);
  });
});
