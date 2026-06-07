import { and, eq } from 'drizzle-orm';

import type { SchedulerStore } from '@stitch/scheduler';
import { createScheduledJobId, createScheduledJobRunId } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { scheduledJobs, scheduledJobRuns } from '@/db/schema.js';

type ScheduledJobRunId = (typeof scheduledJobRuns.$inferSelect)['id'];

export function createSchedulerStore(): SchedulerStore {
  return {
    async upsertJob(input) {
      const db = getDb();
      const existing = db
        .select()
        .from(scheduledJobs)
        .where(eq(scheduledJobs.key, input.key))
        .get();

      if (existing) {
        return db.transaction((tx) => {
          tx.update(scheduledJobRuns)
            .set({
              status: 'failed',
              finishedAt: input.now,
              errorMessage: 'scheduler restarted before run completed',
            })
            .where(and(eq(scheduledJobRuns.key, input.key), eq(scheduledJobRuns.status, 'running')))
            .run();

          const updated = tx
            .update(scheduledJobs)
            .set({
              schedule: input.schedule,
              enabled: input.enabled,
              maxConcurrency: input.maxConcurrency,
              catchup: input.catchup,
              catchupMaxRuns: input.catchupMaxRuns,
              runningCount: 0,
              nextRunAt: input.initialNextRunAt,
              updatedAt: input.now,
            })
            .where(eq(scheduledJobs.key, input.key))
            .returning()
            .get();

          if (!updated) throw new Error(`failed to update scheduled job ${input.key}`);
          return updated;
        });
      }

      const inserted = db
        .insert(scheduledJobs)
        .values({
          id: createScheduledJobId(),
          key: input.key,
          schedule: input.schedule,
          enabled: input.enabled,
          maxConcurrency: input.maxConcurrency,
          catchup: input.catchup,
          catchupMaxRuns: input.catchupMaxRuns,
          nextRunAt: input.initialNextRunAt,
          runningCount: 0,
          totalRuns: 0,
          totalFailures: 0,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning()
        .get();

      if (!inserted) throw new Error(`failed to insert scheduled job ${input.key}`);
      return inserted;
    },

    async getJob(key) {
      const db = getDb();
      return db.select().from(scheduledJobs).where(eq(scheduledJobs.key, key)).get() ?? null;
    },

    async startRun(input) {
      const db = getDb();

      return db.transaction((tx) => {
        const job = tx.select().from(scheduledJobs).where(eq(scheduledJobs.key, input.key)).get();
        if (!job || !job.enabled || job.runningCount >= job.maxConcurrency) {
          return null;
        }

        const runId = createScheduledJobRunId();

        tx.update(scheduledJobs)
          .set({
            runningCount: job.runningCount + 1,
            totalRuns: job.totalRuns + 1,
            lastRunAt: input.now,
            nextRunAt: input.nextRunAt,
            updatedAt: input.now,
          })
          .where(eq(scheduledJobs.id, job.id))
          .run();

        const inserted = tx
          .insert(scheduledJobRuns)
          .values({
            id: runId,
            jobId: job.id,
            key: job.key,
            status: 'running',
            scheduledFor: input.scheduledFor,
            startedAt: input.now,
            createdAt: input.now,
          })
          .returning()
          .get();

        if (!inserted) return null;

        return {
          id: inserted.id,
          jobId: inserted.jobId,
          key: inserted.key,
          scheduledFor: inserted.scheduledFor,
          startedAt: inserted.startedAt,
        };
      });
    },

    async completeRun(input) {
      const db = getDb();
      const runId = input.runId as ScheduledJobRunId;

      db.transaction((tx) => {
        const run = tx.select().from(scheduledJobRuns).where(eq(scheduledJobRuns.id, runId)).get();
        if (!run) return;

        tx.update(scheduledJobRuns)
          .set({
            status: input.succeeded ? 'succeeded' : 'failed',
            finishedAt: input.finishedAt,
            errorMessage: input.succeeded ? null : (input.errorMessage ?? 'unknown error'),
          })
          .where(eq(scheduledJobRuns.id, runId))
          .run();

        const job = tx
          .select()
          .from(scheduledJobs)
          .where(and(eq(scheduledJobs.id, run.jobId), eq(scheduledJobs.key, input.key)))
          .get();

        if (!job) return;

        tx.update(scheduledJobs)
          .set({
            runningCount: Math.max(0, job.runningCount - 1),
            totalFailures: input.succeeded ? job.totalFailures : job.totalFailures + 1,
            lastSuccessAt: input.succeeded ? input.finishedAt : job.lastSuccessAt,
            lastErrorAt: input.succeeded ? job.lastErrorAt : input.finishedAt,
            lastErrorMessage: input.succeeded ? null : (input.errorMessage ?? 'unknown error'),
            updatedAt: input.finishedAt,
          })
          .where(eq(scheduledJobs.id, job.id))
          .run();
      });
    },

    async unregisterJob(key) {
      const db = getDb();
      const updated = db
        .update(scheduledJobs)
        .set({ enabled: false, runningCount: 0, updatedAt: Date.now() })
        .where(eq(scheduledJobs.key, key))
        .returning()
        .get();
      return Boolean(updated);
    },
  };
}
