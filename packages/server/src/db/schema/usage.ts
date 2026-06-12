import { sql } from 'drizzle-orm';
import { blob, check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { PrefixedString } from '@stitch/shared/id';
import type { STTUsage } from '@stitch/shared/stt/types';

import type { LanguageModelUsage } from 'ai';

export const embeddingUsageEvents = sqliteTable(
  'embedding_usage_events',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    totalTokens: integer('total_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    metadata: blob('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('embedding_usage_events_created_at_idx').on(table.createdAt),
    index('embedding_usage_events_provider_model_idx').on(table.providerId, table.modelId),
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

export type SttService = 'chat-input' | 'meeting-recording';

export const sttUsageEvents = sqliteTable(
  'stt_usage_events',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    service: text('service').$type<SttService>().notNull(),
    costUsd: real('cost_usd').notNull().default(0),
    rawData: blob('raw_data', { mode: 'json' }).$type<STTUsage>(),
    metadata: blob('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }).notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('stt_usage_events_service_idx').on(table.service),
    index('stt_usage_events_created_at_idx').on(table.createdAt),
    index('stt_usage_events_provider_model_idx').on(table.providerId, table.modelId),
    check(
      'stt_usage_events_service_check',
      sql`${table.service} in ('chat-input', 'meeting-recording')`,
    ),
  ],
);
