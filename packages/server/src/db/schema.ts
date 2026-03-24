import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { AgentToolType, AgentType } from '@stitch/shared/agents/types';
import type { MessageRole, StoredPart } from '@stitch/shared/chat/messages';
import type { QueuedMessageAttachment } from '@stitch/shared/chat/queue';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';
import type { MeetingStatus, TranscriptionStatus } from '@stitch/shared/meetings/types';
import type {
  AgentPermissionValue,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';
import type { QuestionInfo, QuestionRequestStatus } from '@stitch/shared/questions/types';
import type { SettingsKey } from '@stitch/shared/settings/types';
import type { ShortcutActionId } from '@stitch/shared/shortcuts/types';

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
  category: text('category').notNull().default(''),
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

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').$type<PrefixedString<'agt'>>().primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<AgentType>().notNull().default('primary'),
    isDeletable: integer('is_deletable', { mode: 'boolean' }).notNull().default(true),
    systemPrompt: text('system_prompt'),
    useBasePrompt: integer('use_base_prompt', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [check('agents_type_check', sql`${table.type} in ('primary', 'sub')`)],
);

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
  agentId: text('agent_id')
    .$type<PrefixedString<'agt'>>()
    .notNull()
    .references(() => agents.id),
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
  subAgentId: text('sub_agent_id')
    .$type<PrefixedString<'agt'> | null>()
    .references(() => agents.id),
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
  agentId: text('agent_id')
    .$type<PrefixedString<'agt'>>()
    .notNull()
    .references(() => agents.id),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolInput: blob('tool_input', { mode: 'json' }),
  systemReminder: text('system_reminder').notNull(),
  suggestion: blob('suggestion', { mode: 'json' }).$type<PermissionSuggestion | null>(),
  status: text('status').$type<PermissionResponseStatus>().notNull().default('pending'),
  entry: text('entry'),
  subAgentId: text('sub_agent_id')
    .$type<PrefixedString<'agt'> | null>()
    .references(() => agents.id),
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

export const agentPermissions = sqliteTable(
  'agent_permissions',
  {
    id: text('id').$type<PrefixedString<'perm'>>().primaryKey(),
    agentId: text('agent_id')
      .$type<PrefixedString<'agt'>>()
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    pattern: text('pattern'),
    permission: text('permission').$type<AgentPermissionValue>().notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('agent_permissions_agent_tool_pattern_idx').on(
      table.agentId,
      table.toolName,
      table.pattern,
    ),
  ],
);

export const agentTools = sqliteTable(
  'agent_tools',
  {
    id: text('id').$type<PrefixedString<'agttool'>>().primaryKey(),
    agentId: text('agent_id')
      .$type<PrefixedString<'agt'>>()
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    toolType: text('tool_type').$type<AgentToolType>().notNull(),
    toolName: text('tool_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('agent_tools_agent_type_name_idx').on(
      table.agentId,
      table.toolType,
      table.toolName,
    ),
    check('agent_tools_type_check', sql`${table.toolType} in ('stitch', 'mcp', 'plugin')`),
  ],
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

export const agentMcpServers = sqliteTable(
  'agent_mcp_servers',
  {
    id: text('id').$type<PrefixedString<'agtmcp'>>().primaryKey(),
    agentId: text('agent_id')
      .$type<PrefixedString<'agt'>>()
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    mcpServerId: text('mcp_server_id')
      .$type<PrefixedString<'mcp'>>()
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('agent_mcp_servers_agent_server_idx').on(table.agentId, table.mcpServerId),
  ],
);

export const agentSubAgents = sqliteTable(
  'agent_sub_agents',
  {
    id: text('id').$type<PrefixedString<'agtsub'>>().primaryKey(),
    agentId: text('agent_id')
      .$type<PrefixedString<'agt'>>()
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    subAgentId: text('sub_agent_id')
      .$type<PrefixedString<'agt'>>()
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    providerId: text('provider_id'),
    modelId: text('model_id'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('agent_sub_agents_agent_sub_idx').on(table.agentId, table.subAgentId)],
);

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
    check(
      'meetings_status_check',
      sql`${table.status} in ('detected', 'recording', 'completed')`,
    ),
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
