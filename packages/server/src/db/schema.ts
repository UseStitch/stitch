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
import type { ConnectorStatus } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';
import type { JobSchedule, CatchupPolicy } from '@stitch/scheduler';
import type {
  ToolPermissionValue,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';
import type { QuestionInfo, QuestionRequestStatus } from '@stitch/shared/questions/types';
import type { SettingsKey } from '@stitch/shared/settings/types';
import type { ShortcutActionId, ShortcutCategory } from '@stitch/shared/shortcuts/types';
import type { AutomationScheduleBlob } from '@stitch/shared/automations/types';

import type { ProviderCredentials } from '@/llm/provider/provider.js';
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
  type: text('type', { enum: ['chat', 'automation'] }).notNull().default('chat'),
  automationId: text('automation_id')
    .$type<PrefixedString<'auto'> | null>()
    .references(() => automations.id, { onDelete: 'set null' }),
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

export const scheduledJobs = sqliteTable(
  'scheduled_jobs',
  {
    id: text('id').$type<PrefixedString<'schjob'>>().primaryKey(),
    key: text('key').notNull(),
    schedule: blob('schedule', { mode: 'json' }).$type<JobSchedule>().notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    maxConcurrency: integer('max_concurrency').notNull().default(1),
    queueEnabled: integer('queue_enabled', { mode: 'boolean' }).notNull().default(true),
    catchup: text('catchup').$type<CatchupPolicy>().notNull().default('one'),
    catchupMaxRuns: integer('catchup_max_runs').notNull().default(100),
    nextRunAt: integer('next_run_at', { mode: 'number' }).notNull(),
    runningCount: integer('running_count').notNull().default(0),
    queuedCount: integer('queued_count').notNull().default(0),
    totalRuns: integer('total_runs').notNull().default(0),
    totalFailures: integer('total_failures').notNull().default(0),
    lastRunAt: integer('last_run_at', { mode: 'number' }),
    lastSuccessAt: integer('last_success_at', { mode: 'number' }),
    lastErrorAt: integer('last_error_at', { mode: 'number' }),
    lastErrorMessage: text('last_error_message'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('scheduled_jobs_key_uidx').on(table.key),
    index('scheduled_jobs_next_run_at_idx').on(table.nextRunAt),
    check('scheduled_jobs_catchup_check', sql`${table.catchup} in ('none', 'one', 'all')`),
  ],
);

export const scheduledJobRuns = sqliteTable(
  'scheduled_job_runs',
  {
    id: text('id').$type<PrefixedString<'schrun'>>().primaryKey(),
    jobId: text('job_id')
      .$type<PrefixedString<'schjob'>>()
      .notNull()
      .references(() => scheduledJobs.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    status: text('status').$type<'running' | 'succeeded' | 'failed'>().notNull().default('running'),
    scheduledFor: integer('scheduled_for', { mode: 'number' }).notNull(),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'number' }),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('scheduled_job_runs_job_id_idx').on(table.jobId),
    index('scheduled_job_runs_key_idx').on(table.key),
    check(
      'scheduled_job_runs_status_check',
      sql`${table.status} in ('running', 'succeeded', 'failed')`,
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
    check(
      'connector_status_check',
      sql`${table.status} in ('pending_setup', 'awaiting_auth', 'connected', 'error')`,
    ),
  ],
);
