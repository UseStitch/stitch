import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { paginatedQuery } from '@/lib/paginated-query.js';

import {
  createAgendaItemEventId,
  createAgendaItemId,
  createAgendaListId,
} from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type {
  AgendaItem,
  AgendaItemDetail,
  AgendaItemEvent,
  AgendaItemPriority,
  AgendaItemStatus,
  AgendaList,
  AgendaListWithCounts,
  CreateAgendaItemInput,
  CreateAgendaListInput,
  ListAgendaItemsResponse,
  UpdateAgendaItemInput,
  UpdateAgendaListInput,
} from '@stitch/shared/agenda/types';

import { getDb } from '@/db/client.js';
import { agendaItems, agendaItemEvents, agendaLists } from '@/db/schema.js';

type AgendaListRow = typeof agendaLists.$inferSelect;
type AgendaItemRow = typeof agendaItems.$inferSelect;
type AgendaItemEventRow = typeof agendaItemEvents.$inferSelect;

function toAgendaList(row: AgendaListRow): AgendaList {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    position: row.position,
    isArchived: row.isArchived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAgendaItem(row: AgendaItemRow, listName?: string): AgendaItem {
  return {
    id: row.id,
    listId: row.listId,
    listName,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    sourceSessionId: row.sourceSessionId,
    sourceMessageId: row.sourceMessageId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAgendaItemEvent(row: AgendaItemEventRow): AgendaItemEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    type: row.type,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    content: row.content,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
  };
}

// --- Lists ---

export async function getAgendaLists(input?: {
  includeArchived?: boolean;
}): Promise<AgendaListWithCounts[]> {
  const db = getDb();
  const includeArchived = input?.includeArchived ?? false;

  const conditions = includeArchived ? undefined : eq(agendaLists.isArchived, false);
  const lists = db.select().from(agendaLists).where(conditions).orderBy(agendaLists.position).all();

  const now = Date.now();
  return lists.map((row) => {
    const items = db
      .select({ status: agendaItems.status, dueAt: agendaItems.dueAt })
      .from(agendaItems)
      .where(eq(agendaItems.listId, row.id))
      .all();

    const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
    const counts = { open: 0, in_progress: 0, done: 0, cancelled: 0, total: items.length, overdue: 0, dueSoon: 0 };
    for (const item of items) {
      counts[item.status as keyof typeof counts]++;
      if (
        item.dueAt &&
        item.status !== 'done' &&
        item.status !== 'cancelled'
      ) {
        if (item.dueAt < now) {
          counts.overdue++;
        } else if (item.dueAt <= threeDaysFromNow) {
          counts.dueSoon++;
        }
      }
    }

    return { ...toAgendaList(row), itemCounts: counts };
  });
}

async function getAgendaListByName(
  name: string,
): Promise<AgendaList | null> {
  const db = getDb();
  const row = db
    .select()
    .from(agendaLists)
    .where(sql`lower(${agendaLists.name}) = lower(${name})`)
    .get();
  return row ? toAgendaList(row) : null;
}

export async function createAgendaList(input: CreateAgendaListInput): Promise<AgendaList> {
  const db = getDb();
  const id = createAgendaListId();
  const now = Date.now();

  const maxPosition = db
    .select({ max: sql<number>`coalesce(max(${agendaLists.position}), -1)` })
    .from(agendaLists)
    .get();

  db.insert(agendaLists)
    .values({
      id,
      name: input.name,
      description: input.description ?? '',
      color: input.color ?? null,
      position: (maxPosition?.max ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return toAgendaList(db.select().from(agendaLists).where(eq(agendaLists.id, id)).get()!);
}

export async function updateAgendaList(
  id: PrefixedString<'alist'>,
  input: UpdateAgendaListInput,
): Promise<AgendaList | null> {
  const db = getDb();
  const existing = db.select().from(agendaLists).where(eq(agendaLists.id, id)).get();
  if (!existing) return null;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.color !== undefined) updates.color = input.color;
  if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

  db.update(agendaLists).set(updates).where(eq(agendaLists.id, id)).run();
  return toAgendaList(db.select().from(agendaLists).where(eq(agendaLists.id, id)).get()!);
}

export async function deleteAgendaList(id: PrefixedString<'alist'>): Promise<boolean> {
  const db = getDb();
  const existing = db.select().from(agendaLists).where(eq(agendaLists.id, id)).get();
  if (!existing) return false;
  db.delete(agendaLists).where(eq(agendaLists.id, id)).run();
  return true;
}

export async function mergeAgendaLists(
  targetId: PrefixedString<'alist'>,
  sourceId: PrefixedString<'alist'>,
): Promise<AgendaList | null> {
  const db = getDb();
  const target = db.select().from(agendaLists).where(eq(agendaLists.id, targetId)).get();
  const source = db.select().from(agendaLists).where(eq(agendaLists.id, sourceId)).get();
  if (!target || !source) return null;
  if (targetId === sourceId) return toAgendaList(target);

  db.update(agendaItems)
    .set({ listId: targetId, updatedAt: Date.now() })
    .where(eq(agendaItems.listId, sourceId))
    .run();

  db.delete(agendaLists).where(eq(agendaLists.id, sourceId)).run();

  return toAgendaList(db.select().from(agendaLists).where(eq(agendaLists.id, targetId)).get()!);
}

// --- Items ---

export async function getAgendaItems(input: {
  listId?: PrefixedString<'alist'>;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
  page: number;
  pageSize: number;
}): Promise<ListAgendaItemsResponse> {
  const db = getDb();

  const conditions = [];
  if (input.listId) conditions.push(eq(agendaItems.listId, input.listId));
  if (input.status) conditions.push(eq(agendaItems.status, input.status));
  if (input.priority) conditions.push(eq(agendaItems.priority, input.priority));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await paginatedQuery({
    dataQuery: db
      .select({ item: agendaItems, listName: agendaLists.name })
      .from(agendaItems)
      .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
      .where(where)
      .orderBy(asc(agendaItems.position), desc(agendaItems.createdAt)),
    countQuery: db.select({ total: count() }).from(agendaItems).where(where),
    page: input.page,
    pageSize: input.pageSize,
    transform: (r) => toAgendaItem(r.item, r.listName ?? undefined),
  });

  return result;
}

export async function getAgendaItem(
  id: PrefixedString<'aitm'>,
): Promise<AgendaItemDetail | null> {
  const db = getDb();
  const row = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get();

  if (!row) return null;

  const events = db
    .select()
    .from(agendaItemEvents)
    .where(eq(agendaItemEvents.itemId, id))
    .orderBy(desc(agendaItemEvents.createdAt))
    .all();

  return {
    ...toAgendaItem(row.item, row.listName ?? undefined),
    events: events.map(toAgendaItemEvent),
  };
}

export async function createAgendaItem(input: CreateAgendaItemInput): Promise<AgendaItem> {
  const db = getDb();
  const id = createAgendaItemId();
  const now = Date.now();

  let listId = input.listId;

  if (!listId && input.listName) {
    const existing = await getAgendaListByName(input.listName);
    if (existing) {
      listId = existing.id;
    } else {
      const newList = await createAgendaList({ name: input.listName });
      listId = newList.id;
    }
  }

  if (!listId) {
    const existing = await getAgendaListByName('General');
    if (existing) {
      listId = existing.id;
    } else {
      const newList = await createAgendaList({ name: 'General' });
      listId = newList.id;
    }
  }

  const maxPosition = db
    .select({ max: sql<number>`coalesce(max(${agendaItems.position}), -1)` })
    .from(agendaItems)
    .where(eq(agendaItems.listId, listId))
    .get();

  db.insert(agendaItems)
    .values({
      id,
      listId,
      title: input.title,
      description: input.description ?? '',
      type: 'todo',
      status: input.status ?? 'open',
      priority: input.priority ?? 'medium',
      dueAt: input.dueAt ?? null,
      sourceSessionId: input.sourceSessionId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      position: (maxPosition?.max ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const eventId = createAgendaItemEventId();
  db.insert(agendaItemEvents)
    .values({
      id: eventId,
      itemId: id,
      type: 'created',
      toStatus: input.status ?? 'open',
      content: `Created: ${input.title}`,
      sessionId: input.sourceSessionId ?? null,
      createdAt: now,
    })
    .run();

  const row = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get()!;

  return toAgendaItem(row.item, row.listName ?? undefined);
}

export async function updateAgendaItem(
  id: PrefixedString<'aitm'>,
  input: UpdateAgendaItemInput,
  sessionId?: PrefixedString<'ses'> | null,
): Promise<AgendaItem | null> {
  const db = getDb();
  const existing = db.select().from(agendaItems).where(eq(agendaItems.id, id)).get();
  if (!existing) return null;

  const now = Date.now();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt;
  if (input.listId !== undefined) updates.listId = input.listId;

  if (input.status !== undefined && input.status !== existing.status) {
    updates.status = input.status;
    if (input.status === 'done') {
      updates.completedAt = now;
    } else if (existing.status === 'done') {
      updates.completedAt = null;
    }

    const eventId = createAgendaItemEventId();
    db.insert(agendaItemEvents)
      .values({
        id: eventId,
        itemId: id,
        type: 'status_change',
        fromStatus: existing.status,
        toStatus: input.status,
        content: `Status changed from ${existing.status} to ${input.status}`,
        sessionId: sessionId ?? null,
        createdAt: now,
      })
      .run();
  }

  const hasNonStatusUpdates = Object.keys(updates).some(
    (k) => k !== 'updatedAt' && k !== 'status' && k !== 'completedAt',
  );
  if (hasNonStatusUpdates) {
    const eventId = createAgendaItemEventId();
    const changedFields = Object.keys(input).filter((k) => k !== 'status');
    db.insert(agendaItemEvents)
      .values({
        id: eventId,
        itemId: id,
        type: 'updated',
        content: `Updated: ${changedFields.join(', ')}`,
        sessionId: sessionId ?? null,
        createdAt: now,
      })
      .run();
  }

  db.update(agendaItems).set(updates).where(eq(agendaItems.id, id)).run();

  const row = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get()!;

  return toAgendaItem(row.item, row.listName ?? undefined);
}

export async function deleteAgendaItem(id: PrefixedString<'aitm'>): Promise<boolean> {
  const db = getDb();
  const existing = db.select().from(agendaItems).where(eq(agendaItems.id, id)).get();
  if (!existing) return false;
  db.delete(agendaItems).where(eq(agendaItems.id, id)).run();
  return true;
}

// --- Events ---

export async function addAgendaItemEvent(
  itemId: PrefixedString<'aitm'>,
  input: { content: string; sessionId?: PrefixedString<'ses'> | null },
): Promise<AgendaItemEvent | null> {
  const db = getDb();
  const item = db.select().from(agendaItems).where(eq(agendaItems.id, itemId)).get();
  if (!item) return null;

  const id = createAgendaItemEventId();
  const now = Date.now();

  db.insert(agendaItemEvents)
    .values({
      id,
      itemId,
      type: 'comment',
      content: input.content,
      sessionId: input.sessionId ?? null,
      createdAt: now,
    })
    .run();

  return toAgendaItemEvent(
    db.select().from(agendaItemEvents).where(eq(agendaItemEvents.id, id)).get()!,
  );
}

export async function getAgendaItemEvents(
  itemId: PrefixedString<'aitm'>,
): Promise<AgendaItemEvent[]> {
  const db = getDb();
  const rows = db
    .select()
    .from(agendaItemEvents)
    .where(eq(agendaItemEvents.itemId, itemId))
    .orderBy(desc(agendaItemEvents.createdAt))
    .all();
  return rows.map(toAgendaItemEvent);
}

export async function reorderAgendaItems(
  orderedIds: PrefixedString<'aitm'>[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(agendaItems)
      .set({ position: i, updatedAt: now })
      .where(eq(agendaItems.id, orderedIds[i]))
      .run();
  }
}

export async function reorderAgendaLists(
  orderedIds: PrefixedString<'alist'>[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(agendaLists)
      .set({ position: i, updatedAt: now })
      .where(eq(agendaLists.id, orderedIds[i]))
      .run();
  }
}
