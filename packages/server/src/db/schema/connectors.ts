import { sql } from 'drizzle-orm';
import { blob, check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ConnectorStatus } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';

export const connectorInstances = sqliteTable(
  'connector_instances',
  {
    id: text('id').$type<PrefixedString<'conn'>>().primaryKey(),
    connectorId: text('connector_id').notNull(),
    label: text('label').notNull(),
    appliedVersion: integer('applied_version').notNull().default(1),
    capabilities: blob('capabilities', { mode: 'json' }).$type<string[]>().notNull().default([]),
    clientId: text('client_id'),
    clientSecret: text('client_secret'),
    apiKey: text('api_key'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: integer('token_expires_at', { mode: 'number' }),
    scopes: blob('scopes', { mode: 'json' }).$type<string[]>(),
    status: text('status').$type<ConnectorStatus>().notNull().default('pending_setup'),
    authIssue: text('auth_issue').$type<'reauthorization_required' | 'temporary_failure'>(),
    accountEmail: text('account_email'),
    accountInfo: blob('account_info', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('connector_instances_connector_id_idx').on(table.connectorId),
    check(
      'connector_status_check',
      sql`${table.status} in ('pending_setup', 'awaiting_auth', 'connected', 'error')`,
    ),
  ],
);
