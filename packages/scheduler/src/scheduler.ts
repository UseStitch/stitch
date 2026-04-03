import { getNextCronRunMs } from './cron.js';

import type {
  CatchupPolicy,
  JobSchedule,
  JobStatus,
  RegisteredJob,
  SchedulerLogger,
  SchedulerStore,
} from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_CATCHUP_MAX_RUNS = 100;

type SchedulerOptions = {
  logger: SchedulerLogger;
  store: SchedulerStore;
  pollIntervalMs?: number;
};

type RegisteredJobInternal = Omit<Required<RegisteredJob>, 'callback' | 'schedule'> & {
  callback: RegisteredJob['callback'];
  schedule: JobSchedule;
};

function calculateNextRunMs(schedule: JobSchedule, afterMs: number): number {
  if (schedule.type === 'interval') return afterMs + schedule.everyMs;
  return getNextCronRunMs(schedule.expression, afterMs, schedule.timezone ?? 'UTC');
}

function calculateDueCount(schedule: JobSchedule, nextRunAt: number, now: number, hardLimit: number): number {
  if (now < nextRunAt) return 0;

  if (schedule.type === 'interval') {
    return Math.max(1, Math.floor((now - nextRunAt) / schedule.everyMs) + 1);
  }

  let due = 0;
  let cursor = nextRunAt;

  while (cursor <= now && due < hardLimit) {
    due++;
    cursor = calculateNextRunMs(schedule, cursor);
  }

  return due;
}

function runsToQueue(dueCount: number, catchup: CatchupPolicy, maxRuns: number): number {
  if (dueCount <= 0) return 0;
  if (catchup === 'all') return Math.min(dueCount, Math.max(1, maxRuns));
  if (catchup === 'one') return 1;
  return dueCount > 1 ? 0 : 1;
}

export function createScheduler(options: SchedulerOptions) {
  const logger = options.logger;
  const store = options.store;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const jobs = new Map<string, RegisteredJobInternal>();
  const jobLocks = new Set<string>();
  const inFlightRuns = new Set<Promise<void>>();

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function runCallback(jobKey: string): Promise<void> {
    const job = jobs.get(jobKey);
    if (!job) return;

    const startedRun = await store.startQueuedRun({ key: jobKey, now: Date.now() });
    if (!startedRun) return;

    try {
      await job.callback();
      await store.completeRun({
        runId: startedRun.id,
        key: jobKey,
        finishedAt: Date.now(),
        succeeded: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await store.completeRun({
        runId: startedRun.id,
        key: jobKey,
        finishedAt: Date.now(),
        succeeded: false,
        errorMessage,
      });

      logger.error(
        {
          event: 'scheduler.job.failed',
          key: jobKey,
          runId: startedRun.id,
          error: errorMessage,
        },
        'scheduled job failed',
      );
    }
  }

  async function refillWorkers(jobKey: string, safetyLimit = 1_000): Promise<void> {
    const job = jobs.get(jobKey);
    if (!job) return;

    const status = await store.getJob(jobKey);
    if (!status || !status.enabled || status.maxConcurrency <= status.runningCount) return;

    const availableSlots = Math.max(0, status.maxConcurrency - status.runningCount);
    const toStart = Math.min(availableSlots, status.queuedCount, safetyLimit);

    for (let i = 0; i < toStart; i++) {
      const runPromise = runCallback(jobKey).finally(() => {
        inFlightRuns.delete(runPromise);
      });
      inFlightRuns.add(runPromise);
    }
  }

  async function evaluateDue(jobKey: string): Promise<void> {
    if (jobLocks.has(jobKey)) return;
    const job = jobs.get(jobKey);
    if (!job) return;

    jobLocks.add(jobKey);

    try {
      const state = await store.getJob(jobKey);
      if (!state || !state.enabled) return;

      const now = Date.now();
      const dueCount = calculateDueCount(job.schedule, state.nextRunAt, now, Math.max(1, job.catchupMaxRuns));

      if (dueCount > 0) {
        let nextRunAt = state.nextRunAt;
        const stepped = Math.max(dueCount, 1);
        for (let i = 0; i < stepped; i++) {
          nextRunAt = calculateNextRunMs(job.schedule, nextRunAt);
        }

        const incrementBy = job.queueEnabled ? runsToQueue(dueCount, job.catchup, job.catchupMaxRuns) : 0;

        await store.enqueueDueRuns({
          key: jobKey,
          incrementBy,
          nextRunAt,
          now,
        });
      }

      if (job.queueEnabled) await refillWorkers(jobKey);
    } finally {
      jobLocks.delete(jobKey);
    }
  }

  async function tick(): Promise<void> {
    await Promise.all(Array.from(jobs.keys()).map((jobKey) => evaluateDue(jobKey)));
  }

  async function registerJob(job: RegisteredJob): Promise<void> {
    if (!job.key.trim()) throw new Error('job key must be non-empty');
    if (job.schedule.type === 'interval' && job.schedule.everyMs <= 0) {
      throw new Error('interval schedule everyMs must be greater than zero');
    }

    const normalized: RegisteredJobInternal = {
      ...job,
      enabled: job.enabled ?? true,
      immediate: job.immediate ?? false,
      maxConcurrency: Math.max(1, job.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY),
      queueEnabled: job.queueEnabled ?? true,
      catchup: job.catchup ?? 'one',
      catchupMaxRuns: Math.max(1, job.catchupMaxRuns ?? DEFAULT_CATCHUP_MAX_RUNS),
    };

    jobs.set(job.key, normalized);

    const now = Date.now();

    await store.upsertJob({
      key: normalized.key,
      schedule: normalized.schedule,
      enabled: normalized.enabled,
      maxConcurrency: normalized.maxConcurrency,
      queueEnabled: normalized.queueEnabled,
      catchup: normalized.catchup,
      catchupMaxRuns: normalized.catchupMaxRuns,
      initialNextRunAt: normalized.immediate ? now : calculateNextRunMs(normalized.schedule, now),
      now,
    });

    logger.info({ event: 'scheduler.job.registered', key: normalized.key }, 'scheduled job registered');

    if (timer) await evaluateDue(normalized.key);
  }

  async function unregisterJob(key: string): Promise<boolean> {
    jobs.delete(key);
    const removed = await store.unregisterJob(key);

    logger.info({ event: 'scheduler.job.unregistered', key, removed }, 'scheduled job unregistered');

    return removed;
  }

  async function listJobStatus(): Promise<JobStatus[]> {
    const keys = Array.from(jobs.keys());
    const rows = await store.listJobs(keys);
    return rows.map((row) => ({
      key: row.key,
      enabled: row.enabled,
      runningCount: row.runningCount,
      queuedCount: row.queuedCount,
      maxConcurrency: row.maxConcurrency,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      lastSuccessAt: row.lastSuccessAt,
      lastErrorAt: row.lastErrorAt,
      lastErrorMessage: row.lastErrorMessage,
      totalRuns: row.totalRuns,
      totalFailures: row.totalFailures,
    }));
  }

  async function getJobStatus(key: string): Promise<JobStatus | null> {
    const row = await store.getJob(key);
    if (!row) return null;
    return {
      key: row.key,
      enabled: row.enabled,
      runningCount: row.runningCount,
      queuedCount: row.queuedCount,
      maxConcurrency: row.maxConcurrency,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      lastSuccessAt: row.lastSuccessAt,
      lastErrorAt: row.lastErrorAt,
      lastErrorMessage: row.lastErrorMessage,
      totalRuns: row.totalRuns,
      totalFailures: row.totalFailures,
    };
  }

  async function start(): Promise<void> {
    if (timer) return;
    stopped = false;

    timer = setInterval(() => {
      if (!stopped) void tick();
    }, pollIntervalMs);

    await tick();

    logger.info({ event: 'scheduler.started', pollIntervalMs }, 'scheduler started');
  }

  async function stop(): Promise<void> {
    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    await Promise.allSettled(Array.from(inFlightRuns));

    logger.info({ event: 'scheduler.stopped' }, 'scheduler stopped');
  }

  return {
    start,
    stop,
    registerJob,
    unregisterJob,
    listJobStatus,
    getJobStatus,
  };
}
