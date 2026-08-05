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

export type ChatLlmUsageMetadata = {
  source: 'chat';
  eventType: 'step-success';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  stepIndex: number;
  attemptIndex: number;
  finishReason: string;
};

export type ChatFailedLlmUsageMetadata = {
  source: 'chat';
  eventType: 'attempt-failure';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  stepIndex: number;
  attemptIndex: number;
  streamRunId: string;
  isRetryable: boolean;
};

export type CompactionLlmUsageMetadata = {
  source: 'compaction';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  auto: boolean;
  overflow: boolean;
};

export type DoomLoopFailedLlmUsageMetadata = {
  source: 'doom_loop_summary';
  eventType: 'attempt-failure';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  isRetryable: boolean;
};

export type DoomLoopSummaryLlmUsageMetadata = {
  source: 'doom_loop_summary';
  eventType: 'summary-after-stop';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type ChatTitleGenerationLlmUsageMetadata = {
  source: 'title_generation';
  target: 'chat';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type RecordingTitleGenerationLlmUsageMetadata = {
  source: 'title_generation';
  target: 'recording-analysis';
  recordingId: string;
  analysisId: string;
};

export type TitleGenerationLlmUsageMetadata =
  | ChatTitleGenerationLlmUsageMetadata
  | RecordingTitleGenerationLlmUsageMetadata;

export type AutomationGenerationLlmUsageMetadata = {
  source: 'automation_generation';
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type RecordingAnalysisLlmUsageMetadata = {
  source: 'recording_analysis';
  recordingId: string;
  analysisId: string;
};

export type MemoryExtractionPhase = 'extraction' | 'deduplication' | 'consolidation';

export type MemoryExtractionLlmUsageMetadata = { source: 'memory_extraction'; phase: MemoryExtractionPhase };

export type LlmUsageMetadata =
  | ChatLlmUsageMetadata
  | ChatFailedLlmUsageMetadata
  | CompactionLlmUsageMetadata
  | DoomLoopFailedLlmUsageMetadata
  | DoomLoopSummaryLlmUsageMetadata
  | TitleGenerationLlmUsageMetadata
  | AutomationGenerationLlmUsageMetadata
  | RecordingAnalysisLlmUsageMetadata
  | MemoryExtractionLlmUsageMetadata;

export const llmUsageEvents = sqliteTable(
  'llm_usage_events',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    status: text('status').notNull().default('succeeded'),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    usage: blob('usage', { mode: 'json' }).$type<LanguageModelUsage>(),
    metadata: blob('metadata', { mode: 'json' }).$type<LlmUsageMetadata>(),
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
    check('stt_usage_events_service_check', sql`${table.service} in ('chat-input', 'meeting-recording')`),
  ],
);
