import { and, desc, eq, isNull, like, lt } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createSessionId } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SESSION_PAGE_SIZE = 30;

type CreateSessionInput = {
  title?: string;
  type?: 'chat' | 'automation';
  automationId?: PrefixedString<'auto'>;
  parentSessionId?: string;
};

export async function createSession(input: CreateSessionInput): Promise<ServiceResult<typeof sessions.$inferSelect>> {
  const db = getDb();
  const id = createSessionId();
  const now = Date.now();
  const title = input.title ?? `New Session ${new Date(now).toLocaleString('en-US', { hour12: false })}`;

  const [session] = await db
    .insert(sessions)
    .values({
      id,
      title,
      type: input.type ?? 'chat',
      automationId: input.automationId ?? null,
      parentSessionId: (input.parentSessionId ?? null) as PrefixedString<'ses'> | null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return ok(session);
}

export async function listSessions(
  type: 'chat' | 'automation' = 'chat',
  options: { limit?: number; cursor?: number; search?: string } = {},
): Promise<ServiceResult<{ sessions: (typeof sessions.$inferSelect)[]; hasMore: boolean }>> {
  const db = getDb();
  const pageSize = options.limit ? Math.min(Math.max(options.limit, 1), 100) : DEFAULT_SESSION_PAGE_SIZE;

  const conditions = [eq(sessions.type, type)];
  if (options.cursor !== undefined) {
    conditions.push(lt(sessions.createdAt, options.cursor));
  }
  if (options.search) {
    conditions.push(like(sessions.title, `%${options.search}%`));
  }
  if (type === 'chat') {
    conditions.push(isNull(sessions.parentSessionId));
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  return ok({ sessions: page, hasMore });
}

export async function getSessionById(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<typeof sessions.$inferSelect>> {
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return err('Session not found', 404);
  return ok(session);
}

export async function listSessionMessages(
  sessionId: PrefixedString<'ses'>,
  limit?: number,
  cursor?: number,
): Promise<ServiceResult<{ messages: (typeof messages.$inferSelect)[]; hasMore: boolean }>> {
  const db = getDb();
  const pageSize = limit ? Math.min(Math.max(limit, 1), 200) : DEFAULT_PAGE_SIZE;

  const conditions = [eq(messages.sessionId, sessionId)];
  if (cursor !== undefined) {
    conditions.push(lt(messages.createdAt, cursor));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  page.reverse();
  return ok({ messages: page, hasMore });
}

export async function deleteSession(sessionId: PrefixedString<'ses'>): Promise<ServiceResult<{ id: string }>> {
  const db = getDb();
  const result = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning({ id: sessions.id });
  if (result.length === 0) return err('Session not found', 404);
  return ok(result[0]);
}

export async function renameSession(
  sessionId: PrefixedString<'ses'>,
  title: string,
): Promise<ServiceResult<typeof sessions.$inferSelect>> {
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({ title, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .returning();
  if (!updated) return err('Session not found', 404);
  return ok(updated);
}

export async function markSessionRead(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<typeof sessions.$inferSelect>> {
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({ isUnread: false, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .returning();
  if (!updated) return err('Session not found', 404);
  return ok(updated);
}
