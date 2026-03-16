import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  MessageRole,
  PrefixedString,
  SettingsKey,
  ShortcutActionId,
  StoredPart,
} from '@openwork/shared';

import type { ProviderCredentials } from '@/provider/provider.js';
import type { LanguageModelUsage } from 'ai';

export const userSettings = sqliteTable('user_settings', {
  key: text('key').$type<SettingsKey>().primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const keyboardShortcuts = sqliteTable('keyboard_shortcuts', {
  actionId: text('action_id').$type<ShortcutActionId>().primaryKey(),
  hotkey: text('hotkey'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const providerConfig = sqliteTable('provider_config', {
  providerId: text('provider_id').primaryKey(),
  credentials: blob('credentials', { mode: 'json' }).$type<ProviderCredentials>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agents = sqliteTable('agents', {
  id: text('id').$type<PrefixedString<'agt'>>().primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'primary' | 'sub'>().notNull().default('primary'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isDeletable: integer('is_deletable', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').$type<PrefixedString<'ses'>>().primaryKey(),
  title: text('title'),
  sessionType: text('session_type').$type<'user' | 'title'>().notNull().default('user'),
  parentSessionId: text('parent_session_id')
    .$type<PrefixedString<'ses'> | null>()
    .references((): ReturnType<typeof text> => sessions.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable('messages', {
  id: text('id').$type<PrefixedString<'msg'>>().primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').$type<MessageRole>().notNull(),
  parts: blob('parts', { mode: 'json' }).$type<StoredPart[]>().notNull(),
  modelId: text('model_id').notNull(),
  providerId: text('provider_id').notNull(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
  finishReason: text('finish_reason'),
  isSummary: integer('is_summary', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  duration: integer('duration_ms'),
});

export const questions = sqliteTable('questions', {
  id: text('id').$type<PrefixedString<'quest'>>().primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  questions: blob('questions', { mode: 'json' }).notNull(),
  answers: blob('answers', { mode: 'json' }),
  status: text('status').$type<'pending' | 'answered' | 'rejected'>().notNull().default('pending'),
  toolCallId: text('tool_call_id').notNull(),
  messageId: text('message_id').$type<PrefixedString<'msg'>>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  answeredAt: integer('answered_at', { mode: 'timestamp_ms' }),
});

export const permissionResponses = sqliteTable('permission_responses', {
  id: text('id').$type<PrefixedString<'permres'>>().primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  messageId: text('message_id').$type<PrefixedString<'msg'>>().notNull(),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolInput: blob('tool_input', { mode: 'json' }),
  systemReminder: text('system_reminder').notNull(),
  status: text('status')
    .$type<'pending' | 'allowed' | 'rejected' | 'alternative'>()
    .notNull()
    .default('pending'),
  entry: text('entry'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
});
