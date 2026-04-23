import { asc, eq, sql } from 'drizzle-orm';

import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';
import { createQueuedMessageId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { queuedMessages } from '@/db/schema.js';
import { requireFound } from '@/lib/route-helpers.js';
import { ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

type AddToQueueInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: QueuedMessageAttachment[];
};

type UpdateQueuedMessageInput = {
  content?: string;
  attachments?: QueuedMessageAttachment[];
};

type QueuedMessageRow = typeof queuedMessages.$inferSelect;

export function listQueuedMessages(
  sessionId: PrefixedString<'ses'>,
): ServiceResult<QueuedMessageRow[]> {
  const db = getDb();
  const rows = db
    .select()
    .from(queuedMessages)
    .where(eq(queuedMessages.sessionId, sessionId))
    .orderBy(asc(queuedMessages.position))
    .all();
  return ok(rows);
}

export function addToQueue(input: AddToQueueInput): ServiceResult<QueuedMessageRow> {
  const db = getDb();
  const id = createQueuedMessageId();
  const now = Date.now();

  const maxPositionRow = db
    .select({ maxPos: sql<number>`coalesce(max(${queuedMessages.position}), 0)` })
    .from(queuedMessages)
    .where(eq(queuedMessages.sessionId, input.sessionId))
    .get();

  const position = (maxPositionRow?.maxPos ?? 0) + 1;

  const row = db
    .insert(queuedMessages)
    .values({
      id,
      sessionId: input.sessionId,
      content: input.content,
      attachments: input.attachments ?? [],
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return ok(row);
}

export function updateQueuedMessage(
  id: PrefixedString<'qmsg'>,
  input: UpdateQueuedMessageInput,
): ServiceResult<QueuedMessageRow> {
  const db = getDb();
  const now = Date.now();

  const row = db
    .update(queuedMessages)
    .set({
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
      updatedAt: now,
    })
    .where(eq(queuedMessages.id, id))
    .returning()
    .get();

  return requireFound(row, 'Queued message');
}

export function removeFromQueue(id: PrefixedString<'qmsg'>): ServiceResult<QueuedMessageRow> {
  const db = getDb();

  const row = db.delete(queuedMessages).where(eq(queuedMessages.id, id)).returning().get();

  return requireFound(row, 'Queued message');
}
