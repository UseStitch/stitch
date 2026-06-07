import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { PrefixedString } from '@stitch/shared/id';
import type { ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { ToolEnabledScope } from '@stitch/shared/tools/types';

export const toolPermissions = sqliteTable(
  'tool_permissions',
  {
    id: text('id').$type<PrefixedString<'perm'>>().primaryKey(),
    toolName: text('tool_name').notNull(),
    pattern: text('pattern'),
    permission: text('permission').$type<ToolPermissionValue>().notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('tool_permissions_tool_pattern_idx').on(table.toolName, table.pattern)],
);

export const toolEnabled = sqliteTable(
  'tool_enabled',
  {
    scope: text('scope').$type<ToolEnabledScope>().notNull(),
    identifier: text('identifier').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('tool_enabled_scope_identifier_uidx').on(table.scope, table.identifier)],
);
