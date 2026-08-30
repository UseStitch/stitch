import { and, desc, eq, isNull, like, lt, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { ARCHIVE_REASONS } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createSessionId } from '@stitch/shared/id';

import { cancelBackgroundTasksForParent } from '@/background-tasks/service.js';
import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { createCursorPage, decodeCursor, encodeCursor } from '@/lib/cursor-pagination.js';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SESSION_PAGE_SIZE = 30;

const sessionCursorSchema = z.object({ createdAt: z.number().int(), id: z.string().min(1) });

function encodeSessionCursor(session: { createdAt: number; id: PrefixedString<'ses'> }): string {
  return encodeCursor({ createdAt: session.createdAt, id: session.id });
}

function decodeSessionCursor(cursor: string): { createdAt: number; id: PrefixedString<'ses'> } {
  const decoded = decodeCursor(cursor, sessionCursorSchema);
  return { createdAt: decoded.createdAt, id: decoded.id as PrefixedString<'ses'> };
}

const messageCursorSchema = z.object({ createdAt: z.number().int(), id: z.string().min(1) });

function encodeMessageCursor(message: { createdAt: number; id: PrefixedString<'msg'> }): string {
  return encodeCursor({ createdAt: message.createdAt, id: message.id });
}

function decodeMessageCursor(cursor: string): { createdAt: number; id: PrefixedString<'msg'> } {
  const decoded = decodeCursor(cursor, messageCursorSchema);
  return { createdAt: decoded.createdAt, id: decoded.id as PrefixedString<'msg'> };
}

type CreateSessionInput = {
  title?: string;
  type?: 'chat' | 'automation';
  automationId?: PrefixedString<'auto'>;
  parentSessionId?: PrefixedString<'ses'>;
};

export async function createSession(input: CreateSessionInput): Promise<typeof sessions.$inferSelect> {
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
      parentSessionId: input.parentSessionId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return session;
}

export async function listSessions(
  type: 'chat' | 'automation' = 'chat',
  options: { limit?: number; cursor?: string; search?: string } = {},
): Promise<{ sessions: (typeof sessions.$inferSelect)[]; nextCursor: string | null }> {
  const db = getDb();
  const pageSize = options.limit ? Math.min(Math.max(options.limit, 1), 100) : DEFAULT_SESSION_PAGE_SIZE;

  const conditions = [eq(sessions.type, type)];
  if (options.cursor) {
    const cursor = decodeSessionCursor(options.cursor);
    const cursorCondition = or(
      lt(sessions.createdAt, cursor.createdAt),
      and(eq(sessions.createdAt, cursor.createdAt), lt(sessions.id, cursor.id)),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }
  if (options.search) {
    conditions.push(like(sessions.title, `%${options.search}%`));
  }
  if (type === 'chat') {
    conditions.push(isNull(sessions.parentSessionId));
  }
  conditions.push(isNull(sessions.archivedAt));

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
    .limit(pageSize + 1);

  const page = createCursorPage(rows, pageSize, encodeSessionCursor);
  return { sessions: page.items, nextCursor: page.nextCursor };
}

export async function getSessionById(sessionId: PrefixedString<'ses'>): Promise<typeof sessions.$inferSelect> {
  const db = getDb();
  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId))).at(0);
  if (!session) throw new HTTPException(404, { message: 'Session not found' });
  return session;
}

export async function listSessionMessages(
  sessionId: PrefixedString<'ses'>,
  limit?: number,
  cursor?: string,
): Promise<{ messages: (typeof messages.$inferSelect)[]; nextCursor: string | null }> {
  const db = getDb();
  const pageSize = limit ? Math.min(Math.max(limit, 1), 200) : DEFAULT_PAGE_SIZE;

  const conditions = [eq(messages.sessionId, sessionId), isNull(messages.archivedAt)];
  if (cursor) {
    const decoded = decodeMessageCursor(cursor);
    const cursorCondition = or(
      lt(messages.createdAt, decoded.createdAt),
      and(eq(messages.createdAt, decoded.createdAt), lt(messages.id, decoded.id)),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1);

  const page = createCursorPage(rows, pageSize, encodeMessageCursor);
  page.items.reverse();
  return { messages: page.items, nextCursor: page.nextCursor };
}

async function deleteSessionTree(sessionId: PrefixedString<'ses'>): Promise<{ id: string }> {
  const db = getDb();
  const children = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.parentSessionId, sessionId));
  for (const child of children) {
    await deleteSessionTree(child.id);
  }
  const result = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning({ id: sessions.id });
  if (result.length === 0) throw new HTTPException(404, { message: 'Session not found' });
  return result[0];
}

export async function deleteSession(sessionId: PrefixedString<'ses'>): Promise<{ id: string }> {
  await cancelBackgroundTasksForParent(sessionId);
  return deleteSessionTree(sessionId);
}

export async function archiveSession(sessionId: PrefixedString<'ses'>): Promise<typeof sessions.$inferSelect> {
  await cancelBackgroundTasksForParent(sessionId);
  const db = getDb();
  const now = Date.now();
  const updated = (
    await db
      .update(sessions)
      .set({ archivedAt: now, archivedReason: ARCHIVE_REASONS.archiveSession, updatedAt: now })
      .where(eq(sessions.id, sessionId))
      .returning()
  ).at(0);
  if (!updated) throw new HTTPException(404, { message: 'Session not found' });
  return updated;
}

export async function renameSession(
  sessionId: PrefixedString<'ses'>,
  title: string,
): Promise<typeof sessions.$inferSelect> {
  const db = getDb();
  const updated = (
    await db.update(sessions).set({ title, updatedAt: Date.now() }).where(eq(sessions.id, sessionId)).returning()
  ).at(0);
  if (!updated) throw new HTTPException(404, { message: 'Session not found' });
  return updated;
}

export async function markSessionRead(sessionId: PrefixedString<'ses'>): Promise<typeof sessions.$inferSelect> {
  const db = getDb();
  const updated = (
    await db
      .update(sessions)
      .set({ isUnread: false, updatedAt: Date.now() })
      .where(eq(sessions.id, sessionId))
      .returning()
  ).at(0);
  if (!updated) throw new HTTPException(404, { message: 'Session not found' });
  return updated;
}
