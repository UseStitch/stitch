import { asc, eq, sql } from 'drizzle-orm';

import { createQueuedMessageId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { queuedMessages } from '@/db/schema.js';

import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';

type AddToQueueInput = {
  sessionId: PrefixedString<'ses'>;
  content: string;
  attachments?: QueuedMessageAttachment[];
};

type UpdateQueuedMessageInput = {
  content?: string;
  attachments?: QueuedMessageAttachment[];
};

export function listQueuedMessages(sessionId: PrefixedString<'ses'>) {
  const db = getDb();
  return db
    .select()
    .from(queuedMessages)
    .where(eq(queuedMessages.sessionId, sessionId))
    .orderBy(asc(queuedMessages.position))
    .all();
}

export function addToQueue(input: AddToQueueInput) {
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

  return row;
}

export function updateQueuedMessage(
  id: PrefixedString<'qmsg'>,
  input: UpdateQueuedMessageInput,
) {
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

  return row ?? null;
}

export function removeFromQueue(id: PrefixedString<'qmsg'>) {
  const db = getDb();

  const row = db
    .delete(queuedMessages)
    .where(eq(queuedMessages.id, id))
    .returning()
    .get();

  return row ?? null;
}
