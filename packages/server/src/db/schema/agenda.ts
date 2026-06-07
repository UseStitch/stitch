import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import type { PrefixedString } from '@stitch/shared/id';

/** @deprecated Type field is no longer used but kept for DB compatibility */
type AgendaItemType = 'todo' | 'reminder' | 'checkup';

export const agendaLists = sqliteTable(
  'agenda_lists',
  {
    id: text('id').$type<PrefixedString<'alist'>>().primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color'),
    position: integer('position').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('agenda_lists_name_uidx').on(table.name),
    index('agenda_lists_created_at_idx').on(table.createdAt),
  ],
);

export const agendaItems = sqliteTable(
  'agenda_items',
  {
    id: text('id').$type<PrefixedString<'aitm'>>().primaryKey(),
    listId: text('list_id')
      .$type<PrefixedString<'alist'>>()
      .notNull()
      .references(() => agendaLists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').$type<AgendaItemType>().notNull().default('todo'),
    status: text('status').$type<AgendaItemStatus>().notNull().default('open'),
    priority: text('priority').$type<AgendaItemPriority>().notNull().default('medium'),
    dueAt: integer('due_at', { mode: 'number' }),
    completedAt: integer('completed_at', { mode: 'number' }),
    sourceSessionId: text('source_session_id').$type<PrefixedString<'ses'> | null>(),
    sourceMessageId: text('source_message_id').$type<PrefixedString<'msg'> | null>(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('agenda_items_list_id_idx').on(table.listId),
    index('agenda_items_status_idx').on(table.status),
    index('agenda_items_due_at_idx').on(table.dueAt),
    index('agenda_items_created_at_idx').on(table.createdAt),
    check('agenda_items_type_check', sql`${table.type} in ('todo', 'reminder', 'checkup')`),
    check(
      'agenda_items_status_check',
      sql`${table.status} in ('open', 'in_progress', 'done', 'cancelled')`,
    ),
    check(
      'agenda_items_priority_check',
      sql`${table.priority} in ('low', 'medium', 'high', 'urgent')`,
    ),
  ],
);
