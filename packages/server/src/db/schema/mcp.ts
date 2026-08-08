import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PrefixedString } from '@stitch/shared/id';
import type {
  McpAuthConfig,
  McpAuthStatus,
  McpElicitationContent,
  McpElicitationSchema,
  McpElicitationStatus,
  McpTool,
  McpTransport,
} from '@stitch/shared/mcp/types';

import { sessions } from '@/db/schema/sessions.js';

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').$type<PrefixedString<'mcp'>>().primaryKey(),
  name: text('name').notNull(),
  transport: text('transport').$type<McpTransport>().notNull().default('http'),
  url: text('url').notNull(),
  authConfig: blob('auth_config', { mode: 'json' }).$type<McpAuthConfig>().notNull(),
  authStatus: text('auth_status').$type<McpAuthStatus>().notNull().default('none'),
  tools: blob('tools', { mode: 'json' }).$type<McpTool[]>(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

type OAuthClientInformation = {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  [key: string]: unknown;
};

type OAuthSessionTokens = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  [key: string]: unknown;
};

/**
 * Live OAuth secrets for an MCP server. One row per server. These columns hold
 * tokens, DCR client registration, PKCE verifier, and cached discovery state.
 * Never serialized to the frontend.
 */
export const mcpOAuthSessions = sqliteTable('mcp_oauth_sessions', {
  serverId: text('server_id')
    .$type<PrefixedString<'mcp'>>()
    .primaryKey()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  clientInformation: blob('client_information', { mode: 'json' }).$type<OAuthClientInformation>(),
  tokens: blob('tokens', { mode: 'json' }).$type<OAuthSessionTokens>(),
  codeVerifier: text('code_verifier'),
  discoveryState: blob('discovery_state', { mode: 'json' }).$type<Record<string, unknown>>(),
  state: text('state'),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const mcpElicitations = sqliteTable('mcp_elicitations', {
  id: text('id').$type<PrefixedString<'mcpel'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  serverId: text('server_id')
    .$type<PrefixedString<'mcp'>>()
    .notNull()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  serverName: text('server_name').notNull(),
  mode: text('mode').$type<'form' | 'url'>().notNull(),
  message: text('message').notNull(),
  requestedSchema: blob('requested_schema', { mode: 'json' }).$type<McpElicitationSchema>(),
  url: text('url'),
  externalElicitationId: text('external_elicitation_id'),
  status: text('status').$type<McpElicitationStatus>().notNull().default('pending'),
  content: blob('content', { mode: 'json' }).$type<McpElicitationContent>(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  resolvedAt: integer('resolved_at', { mode: 'number' }),
});
