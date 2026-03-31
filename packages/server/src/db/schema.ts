import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { MessageRole, StoredPart } from '@stitch/shared/chat/messages';
import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';
import type { PrefixedString } from '@stitch/shared/id';
import type { ConnectorStatus } from '@stitch/shared/connectors/types';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';
import type { MeetingStatus, TranscriptionStatus } from '@stitch/shared/meetings/types';
import type {
  ToolPermissionValue,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';
import type { QuestionInfo, QuestionRequestStatus } from '@stitch/shared/questions/types';
import type { SettingsKey } from '@stitch/shared/settings/types';
import type { ShortcutActionId, ShortcutCategory } from '@stitch/shared/shortcuts/types';

import type { ProviderCredentials } from '@/provider/provider.js';
import type { LanguageModelUsage } from 'ai';

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

export const providerConfig = sqliteTable('provider_config', {
  providerId: text('provider_id').primaryKey(),
  credentials: blob('credentials', { mode: 'json' }).$type<ProviderCredentials>().notNull(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').$type<PrefixedString<'ses'>>().primaryKey(),
  title: text('title'),
  parentSessionId: text('parent_session_id')
    .$type<PrefixedString<'ses'> | null>()
    .references((): ReturnType<typeof text> => sessions.id),
  isUnread: integer('is_unread', { mode: 'boolean' }).notNull().default(false),
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
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  duration: integer('duration_ms'),
});

export const llmUsageEvents = sqliteTable(
  'llm_usage_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull().default('succeeded'),
    isAttributable: integer('is_attributable', { mode: 'boolean' }).notNull().default(true),
    sessionId: text('session_id').$type<PrefixedString<'ses'> | null>(),
    messageId: text('message_id').$type<PrefixedString<'msg'> | null>(),
    meetingId: text('meeting_id').$type<PrefixedString<'rec'> | null>(),
    transcriptionId: text('transcription_id').$type<PrefixedString<'transcr'> | null>(),
    stepIndex: integer('step_index'),
    attemptIndex: integer('attempt_index'),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
    metadata: blob('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    errorCode: text('error_code'),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('llm_usage_events_run_id_idx').on(table.runId),
    index('llm_usage_events_source_idx').on(table.source),
    index('llm_usage_events_created_at_idx').on(table.createdAt),
    index('llm_usage_events_provider_model_idx').on(table.providerId, table.modelId),
  ],
);

export const questions = sqliteTable('questions', {
  id: text('id').$type<PrefixedString<'quest'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  questions: blob('questions', { mode: 'json' }).$type<QuestionInfo[]>().notNull(),
  answers: blob('answers', { mode: 'json' }).$type<string[][] | null>(),
  status: text('status').$type<QuestionRequestStatus>().notNull().default('pending'),
  toolCallId: text('tool_call_id').notNull(),
  messageId: text('message_id').$type<PrefixedString<'msg'>>().notNull(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  answeredAt: integer('answered_at', { mode: 'number' }),
});

export const permissionResponses = sqliteTable('permission_responses', {
  id: text('id').$type<PrefixedString<'permres'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  messageId: text('message_id').$type<PrefixedString<'msg'>>().notNull(),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolInput: blob('tool_input', { mode: 'json' }),
  systemReminder: text('system_reminder').notNull(),
  suggestion: blob('suggestion', { mode: 'json' }).$type<PermissionSuggestion | null>(),
  status: text('status').$type<PermissionResponseStatus>().notNull().default('pending'),
  entry: text('entry'),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  resolvedAt: integer('resolved_at', { mode: 'number' }),
});

export const modelVisibility = sqliteTable(
  'model_visibility',
  {
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    visibility: text('visibility').$type<'show' | 'hide'>().notNull(),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('model_visibility_provider_model_idx').on(table.providerId, table.modelId),
  ],
);

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

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').$type<PrefixedString<'mcp'>>().primaryKey(),
  name: text('name').notNull(),
  transport: text('transport').$type<McpTransport>().notNull().default('http'),
  url: text('url').notNull(),
  authConfig: blob('auth_config', { mode: 'json' }).$type<McpAuthConfig>().notNull(),
  tools: blob('tools', { mode: 'json' }).$type<McpTool[]>(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const queuedMessages = sqliteTable('queued_messages', {
  id: text('id').$type<PrefixedString<'qmsg'>>().primaryKey(),
  sessionId: text('session_id')
    .$type<PrefixedString<'ses'>>()
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  attachments: blob('attachments', { mode: 'json' })
    .$type<QueuedMessageAttachment[]>()
    .notNull()
    .default([]),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const meetings = sqliteTable(
  'meetings',
  {
    id: text('id').$type<PrefixedString<'rec'>>().primaryKey(),
    app: text('app').notNull(),
    appPath: text('app_path').notNull(),
    status: text('status').$type<MeetingStatus>().notNull().default('detected'),
    recordingFilePath: text('recording_file_path'),
    durationSecs: real('duration_secs'),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    check('meetings_status_check', sql`${table.status} in ('detected', 'recording', 'completed')`),
  ],
);

export const recordingTranscriptions = sqliteTable(
  'recording_transcriptions',
  {
    id: text('id').$type<PrefixedString<'transcr'>>().primaryKey(),
    meetingId: text('meeting_id')
      .$type<PrefixedString<'rec'>>()
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull().default(''),
    transcript: text('transcript').notNull().default(''),
    summary: text('summary').notNull().default(''),
    title: text('title').notNull().default(''),
    status: text('status').$type<TranscriptionStatus>().notNull().default('pending'),
    errorMessage: text('error_message'),
    modelId: text('model_id').notNull(),
    providerId: text('provider_id').notNull(),
    usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
    costUsd: real('cost_usd').notNull().default(0),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    check(
      'transcription_status_check',
      sql`${table.status} in ('pending', 'processing', 'completed', 'failed')`,
    ),
  ],
);

export const connectorInstances = sqliteTable(
  'connector_instances',
  {
    id: text('id').$type<PrefixedString<'conn'>>().primaryKey(),
    connectorId: text('connector_id').notNull(),
    label: text('label').notNull(),
    appliedVersion: integer('applied_version').notNull().default(1),
    capabilities: blob('capabilities', { mode: 'json' }).$type<string[]>().notNull().default([]),
    oauthProfileId: text('oauth_profile_id').$type<PrefixedString<'connp'>>(),
    clientId: text('client_id'),
    clientSecret: text('client_secret'),
    apiKey: text('api_key'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: integer('token_expires_at', { mode: 'number' }),
    scopes: blob('scopes', { mode: 'json' }).$type<string[]>(),
    status: text('status').$type<ConnectorStatus>().notNull().default('pending_setup'),
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
    index('connector_instances_oauth_profile_id_idx').on(table.oauthProfileId),
    check(
      'connector_status_check',
      sql`${table.status} in ('pending_setup', 'awaiting_auth', 'connected', 'error')`,
    ),
  ],
);

export const connectorOAuthProfiles = sqliteTable(
  'connector_oauth_profiles',
  {
    id: text('id').$type<PrefixedString<'connp'>>().primaryKey(),
    connectorId: text('connector_id').notNull(),
    label: text('label').notNull(),
    clientId: text('client_id').notNull(),
    clientSecret: text('client_secret').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('connector_oauth_profiles_connector_id_idx').on(table.connectorId),
    uniqueIndex('connector_oauth_profiles_connector_label_idx').on(table.connectorId, table.label),
  ],
);
