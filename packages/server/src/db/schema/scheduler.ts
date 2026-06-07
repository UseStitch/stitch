import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { JobSchedule, CatchupPolicy } from '@stitch/scheduler';
import type { PrefixedString } from '@stitch/shared/id';

export const scheduledJobs = sqliteTable(
  'scheduled_jobs',
  {
    id: text('id').$type<PrefixedString<'schjob'>>().primaryKey(),
    key: text('key').notNull(),
    schedule: blob('schedule', { mode: 'json' }).$type<JobSchedule>().notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    maxConcurrency: integer('max_concurrency').notNull().default(1),
    catchup: text('catchup').$type<CatchupPolicy>().notNull().default('one'),
    catchupMaxRuns: integer('catchup_max_runs').notNull().default(100),
    nextRunAt: integer('next_run_at', { mode: 'number' }).notNull(),
    runningCount: integer('running_count').notNull().default(0),
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
