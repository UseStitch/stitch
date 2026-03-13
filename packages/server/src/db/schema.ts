import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProviderCredentials } from '../provider/provider.js';

export const userSettings = sqliteTable('user_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const providerConfig = sqliteTable('provider_config', {
  providerId: text('provider_id').primaryKey(),
  credentials: blob('credentials', { mode: 'json' }).$type<ProviderCredentials>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
