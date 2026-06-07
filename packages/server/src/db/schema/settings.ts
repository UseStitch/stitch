import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { SettingsKey } from '@stitch/shared/settings/types';
import type { ShortcutActionId, ShortcutCategory } from '@stitch/shared/shortcuts/types';

export const userSettings = sqliteTable('user_settings', {
  key: text('key').$type<SettingsKey>().primaryKey(),
  value: text('value').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const keyboardShortcuts = sqliteTable('keyboard_shortcuts', {
  actionId: text('action_id').$type<ShortcutActionId>().primaryKey(),
  hotkey: text('hotkey'),
  isSequence: integer('is_sequence', { mode: 'boolean' }).notNull().default(false),
  label: text('label').notNull().default(''),
  category: text('category').$type<ShortcutCategory>().notNull().default('Workspace'),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});
