import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type {
  AgendaItem,
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
import { createAgendaItemId, createAgendaListId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agendaItems, agendaLists } from '@/db/schema/agenda.js';
import { paginatedQuery } from '@/lib/paginated-query.js';

type AgendaItemRow = typeof agendaItems.$inferSelect;

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

// --- Lists ---

export function getAgendaLists(input?: { includeArchived?: boolean }): AgendaListWithCounts[] {
  const db = getDb();
  const includeArchived = input?.includeArchived ?? false;

  const conditions = includeArchived ? undefined : eq(agendaLists.isArchived, false);
  const lists = db.select().from(agendaLists).where(conditions).orderBy(agendaLists.position).all();

  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const now = Date.now();
  const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;

  // Single query for all items across all lists — avoids N+1
  const allItems = db
    .select({ listId: agendaItems.listId, status: agendaItems.status, dueAt: agendaItems.dueAt })
    .from(agendaItems)
    .where(inArray(agendaItems.listId, listIds))
    .all();

  type Counts = AgendaListWithCounts['itemCounts'];
  const countMap = new Map<string, Counts>();
  const listsWithCounts = lists.map((row) => {
    const itemCounts: Counts = { open: 0, in_progress: 0, done: 0, cancelled: 0, total: 0, overdue: 0, dueSoon: 0 };
    countMap.set(row.id, itemCounts);
    return { ...row, itemCounts };
  });

  for (const item of allItems) {
    const counts = countMap.get(item.listId);
    if (!counts) continue;
    counts.total++;
    counts[item.status]++;
    if (item.dueAt && item.status !== 'done' && item.status !== 'cancelled') {
      if (item.dueAt < now) {
        counts.overdue++;
      } else if (item.dueAt <= threeDaysFromNow) {
        counts.dueSoon++;
      }
    }
  }

  return listsWithCounts;
}

export function getAgendaListByName(name: string): AgendaList | null {
  const db = getDb();
  const row = db
    .select()
    .from(agendaLists)
    .where(sql`lower(${agendaLists.name}) = lower(${name})`)
    .get();
  return row ?? null;
}

export function createAgendaList(input: CreateAgendaListInput): AgendaList {
  const db = getDb();
  const id = createAgendaListId();
  const now = Date.now();

  const maxPosition = db
    .select({ max: sql<number>`coalesce(max(${agendaLists.position}), -1)` })
    .from(agendaLists)
    .get();

  const row = {
    id,
    name: input.name,
    description: input.description ?? '',
    color: input.color ?? null,
    position: (maxPosition?.max ?? -1) + 1,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(agendaLists).values(row).run();

  return row;
}

export function updateAgendaList(id: PrefixedString<'alist'>, input: UpdateAgendaListInput): AgendaList {
  const db = getDb();
  const existing = db.select().from(agendaLists).where(eq(agendaLists.id, id)).get();
  if (!existing) throw new HTTPException(404, { message: 'List not found' });

  const updates: Partial<typeof agendaLists.$inferInsert> = { updatedAt: Date.now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.color !== undefined) updates.color = input.color;
  if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

  db.update(agendaLists).set(updates).where(eq(agendaLists.id, id)).run();

  return { ...existing, ...updates };
}

export function deleteAgendaList(id: PrefixedString<'alist'>): void {
  const db = getDb();
  const deleted = db.delete(agendaLists).where(eq(agendaLists.id, id)).returning().get();
  if (!deleted) throw new HTTPException(404, { message: 'List not found' });
}

export function mergeAgendaLists(targetId: PrefixedString<'alist'>, sourceId: PrefixedString<'alist'>): AgendaList {
  const db = getDb();
  const target = db.select().from(agendaLists).where(eq(agendaLists.id, targetId)).get();
  const source = db.select().from(agendaLists).where(eq(agendaLists.id, sourceId)).get();
  if (!target) throw new HTTPException(404, { message: 'Target list not found' });
  if (!source) throw new HTTPException(404, { message: 'Source list not found' });
  if (targetId === sourceId) return target;

  db.update(agendaItems).set({ listId: targetId, updatedAt: Date.now() }).where(eq(agendaItems.listId, sourceId)).run();

  db.delete(agendaLists).where(eq(agendaLists.id, sourceId)).run();

  return target;
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
    count: db.$count(agendaItems, where),
    page: input.page,
    pageSize: input.pageSize,
  });

  return { ...result, items: result.items.map((r) => toAgendaItem(r.item, r.listName ?? undefined)) };
}

export function getAgendaItem(id: PrefixedString<'aitm'>): AgendaItem {
  const db = getDb();
  const row = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get();

  if (!row) throw new HTTPException(404, { message: 'Item not found' });

  return toAgendaItem(row.item, row.listName ?? undefined);
}

function findOrCreateList(name: string): PrefixedString<'alist'> {
  const existing = getAgendaListByName(name);
  if (existing) return existing.id;
  const newList = createAgendaList({ name });
  return newList.id;
}

export function createAgendaItem(input: CreateAgendaItemInput): AgendaItem {
  const db = getDb();
  const id = createAgendaItemId();
  const now = Date.now();

  const listId = input.listId ?? findOrCreateList(input.listName ?? 'General');

  const maxPosition = db
    .select({ max: sql<number>`coalesce(max(${agendaItems.position}), -1)` })
    .from(agendaItems)
    .where(eq(agendaItems.listId, listId))
    .get();

  const itemRow = {
    id,
    listId,
    title: input.title,
    description: input.description ?? '',
    type: 'todo' as const,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    dueAt: input.dueAt ?? null,
    completedAt: null,
    sourceSessionId: input.sourceSessionId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    position: (maxPosition?.max ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(agendaItems).values(itemRow).run();

  const listRow = db.select().from(agendaLists).where(eq(agendaLists.id, listId)).get();

  return toAgendaItem(itemRow as AgendaItemRow, listRow?.name);
}

export function updateAgendaItem(id: PrefixedString<'aitm'>, input: UpdateAgendaItemInput): AgendaItem {
  const db = getDb();
  const existing = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get();
  if (!existing) throw new HTTPException(404, { message: 'Item not found' });

  const now = Date.now();
  const updates: Partial<AgendaItemRow> = { updatedAt: now };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt;
  if (input.listId !== undefined) updates.listId = input.listId;

  if (input.status !== undefined && input.status !== existing.item.status) {
    updates.status = input.status;
    if (input.status === 'done') {
      updates.completedAt = now;
    } else if (existing.item.status === 'done') {
      updates.completedAt = null;
    }
  }

  db.update(agendaItems).set(updates).where(eq(agendaItems.id, id)).run();

  const resolvedListName =
    input.listId !== undefined
      ? db.select().from(agendaLists).where(eq(agendaLists.id, input.listId)).get()?.name
      : (existing.listName ?? undefined);

  return toAgendaItem({ ...existing.item, ...updates } as AgendaItemRow, resolvedListName);
}

export function deleteAgendaItem(id: PrefixedString<'aitm'>): void {
  const db = getDb();
  const deleted = db.delete(agendaItems).where(eq(agendaItems.id, id)).returning().get();
  if (!deleted) throw new HTTPException(404, { message: 'Item not found' });
}

export function reorderAgendaItems(orderedIds: PrefixedString<'aitm'>[]): void {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(agendaItems).set({ position: i, updatedAt: now }).where(eq(agendaItems.id, orderedIds[i])).run();
    }
  });
}

export function reorderAgendaLists(orderedIds: PrefixedString<'alist'>[]): void {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(agendaLists).set({ position: i, updatedAt: now }).where(eq(agendaLists.id, orderedIds[i])).run();
    }
  });
}
