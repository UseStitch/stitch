import { blob, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { MessageRole, StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import type { TodoPriority, TodoStatus } from '@stitch/shared/todos/types';

import { automations } from '@/db/schema/automations.js';
import type { SessionToolsetState } from '@/llm/stream/session-toolsets.js';
import type { LanguageModelUsage } from 'ai';

export const sessions = sqliteTable('sessions', {
  id: text('id').$type<PrefixedString<'ses'>>().primaryKey(),
  title: text('title'),
  type: text('type', { enum: ['chat', 'automation'] })
    .notNull()
    .default('chat'),
  automationId: text('automation_id')
    .$type<PrefixedString<'auto'> | null>()
    .references(() => automations.id, { onDelete: 'set null' }),
  parentSessionId: text('parent_session_id')
    .$type<PrefixedString<'ses'> | null>()
    .references((): ReturnType<typeof text> => sessions.id),
  isUnread: integer('is_unread', { mode: 'boolean' }).notNull().default(false),
  toolsetState: blob('toolset_state', { mode: 'json' }).$type<SessionToolsetState | null>(),
  archivedAt: integer('archived_at', { mode: 'number' }),
  archivedReason: text('archived_reason'),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const messages = sqliteTable('messages', {
  id: text('id').$type<PrefixedString<'msg'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').$type<MessageRole>().notNull(),
  parts: blob('parts', { mode: 'json' }).$type<StoredPart[]>().notNull(),
  modelId: text('model_id').notNull(),
  providerId: text('provider_id').notNull(),
  usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
  costUsd: real('cost_usd').notNull().default(0),
  finishReason: text('finish_reason'),
  isSummary: integer('is_summary', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at', { mode: 'number' }),
  archivedReason: text('archived_reason'),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  duration: integer('duration_ms'),
});

export const sessionTodos = sqliteTable(
  'session_todos',
  {
    id: text('id').$type<PrefixedString<'todo'>>().primaryKey(),
    sessionId: text('session_id')
      .$type<PrefixedString<'ses'>>()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    status: text('status').$type<TodoStatus>().notNull(),
    priority: text('priority').$type<TodoPriority>().notNull(),
    sortOrder: integer('sort_order', { mode: 'number' }).notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('session_todos_session_id_idx').on(table.sessionId),
    index('session_todos_order_idx').on(table.sessionId, table.sortOrder),
  ],
);
