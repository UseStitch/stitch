import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AutomationScheduleBlob } from '@stitch/shared/automations/types';
import type { PrefixedString } from '@stitch/shared/id';

export const automations = sqliteTable('automations', {
  id: text('id').$type<PrefixedString<'auto'>>().primaryKey(),
  providerId: text('provider_id').notNull(),
  modelId: text('model_id').notNull(),
  initialMessage: text('initial_message').notNull(),
  title: text('title').notNull(),
  schedule: blob('schedule', { mode: 'json' }).$type<AutomationScheduleBlob | null>(),
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});
