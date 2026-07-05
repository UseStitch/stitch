import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

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
import { ok, err } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

type AgendaListRow = typeof agendaLists.$inferSelect;
type AgendaItemRow = typeof agendaItems.$inferSelect;

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

// --- Lists ---

export function getAgendaLists(input?: { includeArchived?: boolean }): ServiceResult<AgendaListWithCounts[]> {
  const db = getDb();
  const includeArchived = input?.includeArchived ?? false;

  const conditions = includeArchived ? undefined : eq(agendaLists.isArchived, false);
  const lists = db.select().from(agendaLists).where(conditions).orderBy(agendaLists.position).all();

  if (lists.length === 0) return ok([]);

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
  for (const list of lists) {
    countMap.set(list.id, { open: 0, in_progress: 0, done: 0, cancelled: 0, total: 0, overdue: 0, dueSoon: 0 });
  }

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

  return ok(lists.map((row) => ({ ...toAgendaList(row), itemCounts: countMap.get(row.id)! })));
}

export function getAgendaListByName(name: string): ServiceResult<AgendaList | null> {
  const db = getDb();
  const row = db
    .select()
    .from(agendaLists)
    .where(sql`lower(${agendaLists.name}) = lower(${name})`)
    .get();
  return ok(row ? toAgendaList(row) : null);
}

export function createAgendaList(input: CreateAgendaListInput): ServiceResult<AgendaList> {
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

  return ok(toAgendaList(row as AgendaListRow));
}

export function updateAgendaList(id: PrefixedString<'alist'>, input: UpdateAgendaListInput): ServiceResult<AgendaList> {
  const db = getDb();
  const existing = db.select().from(agendaLists).where(eq(agendaLists.id, id)).get();
  if (!existing) return err('List not found', 404);

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.color !== undefined) updates.color = input.color;
  if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

  db.update(agendaLists).set(updates).where(eq(agendaLists.id, id)).run();

  return ok(toAgendaList({ ...existing, ...updates } as AgendaListRow));
}

export function deleteAgendaList(id: PrefixedString<'alist'>): ServiceResult<null> {
  const db = getDb();
  const deleted = db.delete(agendaLists).where(eq(agendaLists.id, id)).returning().get();
  if (!deleted) return err('List not found', 404);
  return ok(null);
}

export function mergeAgendaLists(
  targetId: PrefixedString<'alist'>,
  sourceId: PrefixedString<'alist'>,
): ServiceResult<AgendaList> {
  const db = getDb();
  const target = db.select().from(agendaLists).where(eq(agendaLists.id, targetId)).get();
  const source = db.select().from(agendaLists).where(eq(agendaLists.id, sourceId)).get();
  if (!target) return err('Target list not found', 404);
  if (!source) return err('Source list not found', 404);
  if (targetId === sourceId) return ok(toAgendaList(target));

  db.update(agendaItems).set({ listId: targetId, updatedAt: Date.now() }).where(eq(agendaItems.listId, sourceId)).run();

  db.delete(agendaLists).where(eq(agendaLists.id, sourceId)).run();

  return ok(toAgendaList(target));
}

// --- Items ---

export async function getAgendaItems(input: {
  listId?: PrefixedString<'alist'>;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
  page: number;
  pageSize: number;
}): Promise<ServiceResult<ListAgendaItemsResponse>> {
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
    countQuery: db
      .select({ total: sql<number>`count(*)` })
      .from(agendaItems)
      .where(where),
    page: input.page,
    pageSize: input.pageSize,
    transform: (r) => toAgendaItem(r.item, r.listName ?? undefined),
  });

  return ok(result);
}

export function getAgendaItem(id: PrefixedString<'aitm'>): ServiceResult<AgendaItem> {
  const db = getDb();
  const row = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get();

  if (!row) return err('Item not found', 404);

  return ok(toAgendaItem(row.item, row.listName ?? undefined));
}

function findOrCreateList(name: string): PrefixedString<'alist'> {
  const existingResult = getAgendaListByName(name);
  if ('data' in existingResult && existingResult.data) return existingResult.data.id;
  const newListResult = createAgendaList({ name });
  return (newListResult as { data: AgendaList }).data.id;
}

export function createAgendaItem(input: CreateAgendaItemInput): ServiceResult<AgendaItem> {
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

  return ok(toAgendaItem(itemRow as AgendaItemRow, listRow?.name));
}

export function updateAgendaItem(id: PrefixedString<'aitm'>, input: UpdateAgendaItemInput): ServiceResult<AgendaItem> {
  const db = getDb();
  const existing = db
    .select({ item: agendaItems, listName: agendaLists.name })
    .from(agendaItems)
    .leftJoin(agendaLists, eq(agendaItems.listId, agendaLists.id))
    .where(eq(agendaItems.id, id))
    .get();
  if (!existing) return err('Item not found', 404);

  const now = Date.now();
  const updates: Record<string, unknown> = { updatedAt: now };
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

  return ok(toAgendaItem({ ...existing.item, ...updates } as AgendaItemRow, resolvedListName));
}

export function deleteAgendaItem(id: PrefixedString<'aitm'>): ServiceResult<null> {
  const db = getDb();
  const deleted = db.delete(agendaItems).where(eq(agendaItems.id, id)).returning().get();
  if (!deleted) return err('Item not found', 404);
  return ok(null);
}

export function reorderAgendaItems(orderedIds: PrefixedString<'aitm'>[]): ServiceResult<null> {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(agendaItems).set({ position: i, updatedAt: now }).where(eq(agendaItems.id, orderedIds[i])).run();
    }
  });
  return ok(null);
}

export function reorderAgendaLists(orderedIds: PrefixedString<'alist'>[]): ServiceResult<null> {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(agendaLists).set({ position: i, updatedAt: now }).where(eq(agendaLists.id, orderedIds[i])).run();
    }
  });
  return ok(null);
}
