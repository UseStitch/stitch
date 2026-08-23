import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { BackgroundTaskDeliveryStatus, BackgroundTaskStatus } from '@stitch/shared/background-tasks/types';
import type { PrefixedString } from '@stitch/shared/id';

import { messages, sessions } from '@/db/schema/sessions.js';

export const backgroundTasks = sqliteTable(
  'background_tasks',
  {
    id: text('id').$type<PrefixedString<'ses'>>().primaryKey(),
    parentSessionId: text('parent_session_id')
      .$type<PrefixedString<'ses'>>()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    childSessionId: text('child_session_id')
      .$type<PrefixedString<'ses'>>()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    originMessageId: text('origin_message_id')
      .$type<PrefixedString<'msg'>>()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    originToolCallId: text('origin_tool_call_id').notNull(),
    title: text('title').notNull(),
    status: text('status').$type<BackgroundTaskStatus>().notNull().default('running'),
    deliveryStatus: text('delivery_status').$type<BackgroundTaskDeliveryStatus>().notNull().default('pending'),
    deliveryMessageId: text('delivery_message_id').$type<PrefixedString<'msg'> | null>(),
    result: text('result'),
    error: text('error'),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    activeToolsetIds: blob('active_toolset_ids', { mode: 'json' }).$type<string[]>().notNull(),
    startedAt: integer('started_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    completedAt: integer('completed_at', { mode: 'number' }),
    deliveredAt: integer('delivered_at', { mode: 'number' }),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('background_tasks_parent_status_idx').on(table.parentSessionId, table.status),
    index('background_tasks_parent_delivery_idx').on(table.parentSessionId, table.deliveryStatus),
    uniqueIndex('background_tasks_child_session_id_unique').on(table.childSessionId),
    index('background_tasks_origin_idx').on(table.originMessageId, table.originToolCallId),
  ],
);
