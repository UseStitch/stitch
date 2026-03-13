import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProviderCredentials } from '../provider/provider.js';
import type { SettingsKey, ShortcutActionId } from '@openwork/shared';

export const userSettings = sqliteTable('user_settings', {
  key: text('key').$type<SettingsKey>().primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const keyboardShortcuts = sqliteTable('keyboard_shortcuts', {
  actionId: text('action_id').$type<ShortcutActionId>().primaryKey(),
  hotkey: text('hotkey'),
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
