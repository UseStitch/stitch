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

import type { PrefixedString } from '@stitch/shared/id';
import type {
  RecordingAnalysisStatus,
  RecordingPlatform,
  RecordingStatus,
} from '@stitch/shared/recordings/types';

import type { LanguageModelUsage } from 'ai';

export const recordings = sqliteTable(
  'recordings',
  {
    id: text('id').$type<PrefixedString<'rec'>>().primaryKey(),
    title: text('title').notNull(),
    source: text('source').notNull().default('manual'),
    status: text('status').$type<RecordingStatus>().notNull().default('recording'),
    platform: text('platform').$type<RecordingPlatform>().notNull().default('manual'),
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
    title: text('title').notNull().default(''),
    templateId: text('template_id').$type<PrefixedString<'mnt'>>(),
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

export const meetingNoteTemplates = sqliteTable(
  'meeting_note_templates',
  {
    id: text('id').$type<PrefixedString<'mnt'>>().primaryKey(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index('meeting_note_templates_updated_at_idx').on(table.updatedAt)],
);
