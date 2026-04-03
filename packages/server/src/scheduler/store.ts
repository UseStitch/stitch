import { and, eq, inArray, sql } from 'drizzle-orm';

import { createScheduledJobId, createScheduledJobRunId } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { scheduledJobs, scheduledJobRuns } from '@/db/schema.js';

import type { SchedulerStore } from '@stitch/scheduler';

type ScheduledJobRunId = (typeof scheduledJobRuns.$inferSelect)['id'];

export function createSchedulerStore(): SchedulerStore {
  return {
    async upsertJob(input) {
      const db = getDb();
      const existing = db.select().from(scheduledJobs).where(eq(scheduledJobs.key, input.key)).get();

      if (existing) {
        const updated = db
          .update(scheduledJobs)
          .set({
            schedule: input.schedule,
            enabled: input.enabled,
            maxConcurrency: input.maxConcurrency,
            queueEnabled: input.queueEnabled,
            catchup: input.catchup,
            catchupMaxRuns: input.catchupMaxRuns,
            updatedAt: input.now,
          })
          .where(eq(scheduledJobs.key, input.key))
          .returning()
          .get();

        if (!updated) throw new Error(`failed to update scheduled job ${input.key}`);
        return updated;
      }

      const inserted = db
        .insert(scheduledJobs)
        .values({
          id: createScheduledJobId(),
          key: input.key,
          schedule: input.schedule,
          enabled: input.enabled,
          maxConcurrency: input.maxConcurrency,
          queueEnabled: input.queueEnabled,
          catchup: input.catchup,
          catchupMaxRuns: input.catchupMaxRuns,
          nextRunAt: input.initialNextRunAt,
          runningCount: 0,
          queuedCount: 0,
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

    async listJobs(keys) {
      if (keys.length === 0) return [];
      const db = getDb();
      return db.select().from(scheduledJobs).where(inArray(scheduledJobs.key, keys)).all();
    },

    async enqueueDueRuns(input) {
      const db = getDb();
      return (
        db
          .update(scheduledJobs)
          .set({
            queuedCount: sql`max(0, ${scheduledJobs.queuedCount} + ${input.incrementBy})`,
            nextRunAt: input.nextRunAt,
            updatedAt: input.now,
          })
          .where(eq(scheduledJobs.key, input.key))
          .returning()
          .get() ?? null
      );
    },

    async startQueuedRun(input) {
      const db = getDb();

      return db.transaction((tx) => {
        const job = tx.select().from(scheduledJobs).where(eq(scheduledJobs.key, input.key)).get();
        if (!job || !job.enabled || job.queuedCount <= 0 || job.runningCount >= job.maxConcurrency) {
          return null;
        }

        const runId = createScheduledJobRunId();

        tx.update(scheduledJobs)
          .set({
            queuedCount: job.queuedCount - 1,
            runningCount: job.runningCount + 1,
            totalRuns: job.totalRuns + 1,
            lastRunAt: input.now,
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
            scheduledFor: input.now,
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
      const deleted = db.delete(scheduledJobs).where(eq(scheduledJobs.key, key)).returning().get();
      return Boolean(deleted);
    },
  };
}
