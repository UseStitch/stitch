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

import type { JobSchedule, CatchupPolicy } from '@stitch/scheduler';
import type {
  AgendaEventType,
  AgendaItemPriority,
  AgendaItemStatus,
} from '@stitch/shared/agenda/types';
import type { AutomationScheduleBlob } from '@stitch/shared/automations/types';
import type { MessageRole, StoredPart } from '@stitch/shared/chat/messages';
import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';
import type { ConnectorStatus } from '@stitch/shared/connectors/types';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';
import type {
  ToolPermissionValue,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';
import type { QuestionInfo, QuestionRequestStatus } from '@stitch/shared/questions/types';
import type { TodoPriority, TodoStatus } from '@stitch/shared/todos/types';
import type { ToolEnabledScope } from '@stitch/shared/tools/types';

/** @deprecated Type field is no longer used but kept for DB compatibility */
type AgendaItemType = 'todo' | 'reminder' | 'checkup';
import type {
  RecordingAnalysisTopicSection,
  RecordingAnalysisStatus,
  RecordingPlatform,
  RecordingStatus,
  RecordingTranscriptEntry,
} from '@stitch/shared/recordings/types';
import type { SettingsKey } from '@stitch/shared/settings/types';
import type { ShortcutActionId, ShortcutCategory } from '@stitch/shared/shortcuts/types';
import type { SkillId } from '@stitch/shared/skills/types';

import type { ProviderCredentials } from '@/llm/provider/provider.js';
import type { SessionToolsetState } from '@/llm/stream/session-toolsets.js';
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
  type: text('type', { enum: ['chat', 'automation'] })
    .notNull()
    .default('chat'),
  automationId: text('automation_id')
    .$type<PrefixedString<'auto'> | null>()
    .references(() => automations.id, { onDelete: 'set null' }),
  parentSessionId: text('parent_session_id')
    .$type<PrefixedString<'ses'> | null>()
    .references((): ReturnType<typeof text> => sessions.id),
  isUnread: integer('is_unread', { mode: 'boolean' }).notNull().default(false),
  activeToolsetIds: blob('active_toolset_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  toolsetState: blob('toolset_state', { mode: 'json' }).$type<SessionToolsetState | null>(),
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

export const sessionTodos = sqliteTable(
  'session_todos',
  {
    id: text('id').$type<PrefixedString<'todo'>>().primaryKey(),
    sessionId: text('session_id')
      .$type<PrefixedString<'ses'>>()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    status: text('status').$type<TodoStatus>().notNull(),
    priority: text('priority').$type<TodoPriority>().notNull(),
    sortOrder: integer('sort_order', { mode: 'number' }).notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('session_todos_session_id_idx').on(table.sessionId),
    index('session_todos_order_idx').on(table.sessionId, table.sortOrder),
  ],
);

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

import type { RawModel } from '@/llm/provider/models.js';

type OllamaModality = NonNullable<RawModel['modalities']>['input'][number];

export const ollamaModels = sqliteTable('ollama_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contextWindow: integer('context_window').notNull().default(8192),
  inputLimit: integer('input_limit'),
  outputLimit: integer('output_limit').notNull().default(8192),
  inputCostPerMillion: real('input_cost_per_million').notNull().default(0),
  outputCostPerMillion: real('output_cost_per_million').notNull().default(0),
  cacheReadCostPerMillion: real('cache_read_cost_per_million'),
  cacheWriteCostPerMillion: real('cache_write_cost_per_million'),
  supportsToolCalls: integer('supports_tool_calls', { mode: 'boolean' }).notNull().default(false),
  supportsVision: integer('supports_vision', { mode: 'boolean' }).notNull().default(false),
  supportsReasoning: integer('supports_reasoning', { mode: 'boolean' }).notNull().default(false),
  inputModalities: blob('input_modalities', { mode: 'json' })
    .$type<OllamaModality[]>()
    .notNull()
    .default(['text']),
  outputModalities: blob('output_modalities', { mode: 'json' })
    .$type<OllamaModality[]>()
    .notNull()
    .default(['text']),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

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

export const skillMetadata = sqliteTable(
  'skill_metadata',
  {
    id: text('id').$type<SkillId>().primaryKey(),
    name: text('name').notNull(),
    isExternal: integer('is_external', { mode: 'boolean' }).notNull().default(false),
    source: text('source'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('skill_metadata_source_uidx').on(table.source)],
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

export const lanceMigrations = sqliteTable('lance_migrations', {
  version: integer('version').primaryKey(),
  id: text('id').notNull().default(''),
  prevId: text('prev_id'),
  name: text('name').notNull(),
  checksum: text('checksum').notNull().default(''),
  status: text('status', { enum: ['applied', 'failed'] })
    .notNull()
    .default('applied'),
  error: text('error'),
  appliedAt: integer('applied_at', { mode: 'number' }).notNull(),
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

export const recordings = sqliteTable(
  'recordings',
  {
    id: text('id').$type<PrefixedString<'rec'>>().primaryKey(),
    title: text('title').notNull(),
    source: text('source').notNull().default('manual'),
    status: text('status').$type<RecordingStatus>().notNull().default('recording'),
    platform: text('platform').$type<RecordingPlatform>().notNull().default('manual'),
    mimeType: text('mime_type').notNull().default('audio/ogg'),
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    durationMs: integer('duration_ms'),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('recordings_created_at_idx').on(table.createdAt),
    index('recordings_status_idx').on(table.status),
    check('recordings_status_check', sql`${table.status} in ('recording', 'completed', 'failed')`),
  ],
);

export const recordingAnalyses = sqliteTable(
  'recording_analyses',
  {
    id: text('id').$type<PrefixedString<'recan'>>().primaryKey(),
    recordingId: text('recording_id')
      .$type<PrefixedString<'rec'>>()
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    status: text('status').$type<RecordingAnalysisStatus>().notNull().default('pending'),
    transcript: blob('transcript', { mode: 'json' }).$type<RecordingTranscriptEntry[]>(),
    topicSections: blob('topic_sections', { mode: 'json' }).$type<
      RecordingAnalysisTopicSection[]
    >(),
    summary: text('summary').notNull().default(''),
    title: text('title').notNull().default(''),
    error: text('error'),
    transcriptionProviderId: text('transcription_provider_id'),
    transcriptionModelId: text('transcription_model_id'),
    analysisProviderId: text('analysis_provider_id'),
    analysisModelId: text('analysis_model_id'),
    usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
    costUsd: real('cost_usd').notNull().default(0),
    startedAt: integer('started_at', { mode: 'number' }),
    endedAt: integer('ended_at', { mode: 'number' }),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('recording_analyses_recording_id_uidx').on(table.recordingId),
    index('recording_analyses_status_idx').on(table.status),
    check(
      'recording_analyses_status_check',
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

export const agendaLists = sqliteTable(
  'agenda_lists',
  {
    id: text('id').$type<PrefixedString<'alist'>>().primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color'),
    position: integer('position').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('agenda_lists_name_uidx').on(table.name),
    index('agenda_lists_created_at_idx').on(table.createdAt),
  ],
);

export const agendaItems = sqliteTable(
  'agenda_items',
  {
    id: text('id').$type<PrefixedString<'aitm'>>().primaryKey(),
    listId: text('list_id')
      .$type<PrefixedString<'alist'>>()
      .notNull()
      .references(() => agendaLists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').$type<AgendaItemType>().notNull().default('todo'),
    status: text('status').$type<AgendaItemStatus>().notNull().default('open'),
    priority: text('priority').$type<AgendaItemPriority>().notNull().default('medium'),
    dueAt: integer('due_at', { mode: 'number' }),
    completedAt: integer('completed_at', { mode: 'number' }),
    sourceSessionId: text('source_session_id').$type<PrefixedString<'ses'> | null>(),
    sourceMessageId: text('source_message_id').$type<PrefixedString<'msg'> | null>(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('agenda_items_list_id_idx').on(table.listId),
    index('agenda_items_status_idx').on(table.status),
    index('agenda_items_due_at_idx').on(table.dueAt),
    index('agenda_items_created_at_idx').on(table.createdAt),
    check('agenda_items_type_check', sql`${table.type} in ('todo', 'reminder', 'checkup')`),
    check(
      'agenda_items_status_check',
      sql`${table.status} in ('open', 'in_progress', 'done', 'cancelled')`,
    ),
    check(
      'agenda_items_priority_check',
      sql`${table.priority} in ('low', 'medium', 'high', 'urgent')`,
    ),
  ],
);

export const agendaItemEvents = sqliteTable(
  'agenda_item_events',
  {
    id: text('id').$type<PrefixedString<'aevt'>>().primaryKey(),
    itemId: text('item_id')
      .$type<PrefixedString<'aitm'>>()
      .notNull()
      .references(() => agendaItems.id, { onDelete: 'cascade' }),
    type: text('type').$type<AgendaEventType>().notNull(),
    fromStatus: text('from_status').$type<AgendaItemStatus>(),
    toStatus: text('to_status').$type<AgendaItemStatus>(),
    content: text('content').notNull().default(''),
    sessionId: text('session_id').$type<PrefixedString<'ses'> | null>(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('agenda_item_events_item_id_idx').on(table.itemId),
    index('agenda_item_events_created_at_idx').on(table.createdAt),
    check(
      'agenda_item_events_type_check',
      sql`${table.type} in ('created', 'status_change', 'updated', 'comment')`,
    ),
  ],
);
