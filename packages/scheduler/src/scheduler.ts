import { getNextCronRunMs } from './cron.js';

import type {
  CatchupPolicy,
  JobSchedule,
  PersistedJobRun,
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

function calculateNextDueRunMs(schedule: JobSchedule, nextRunAt: number, dueCount: number): number {
  if (schedule.type === 'interval') return nextRunAt + schedule.everyMs * dueCount;

  let cursor = nextRunAt;
  for (let i = 0; i < dueCount; i++) {
    cursor = calculateNextRunMs(schedule, cursor);
  }
  return cursor;
}

function calculateDueTimes(
  schedule: JobSchedule,
  nextRunAt: number,
  now: number,
  hardLimit: number,
): number[] {
  if (now < nextRunAt) return [];

  if (schedule.type === 'interval') {
    const dueCount = Math.max(1, Math.floor((now - nextRunAt) / schedule.everyMs) + 1);
    const limitedCount = Math.min(dueCount, hardLimit);
    return Array.from({ length: limitedCount }, (_, index) => nextRunAt + schedule.everyMs * index);
  }

  const dueTimes: number[] = [];
  let cursor = nextRunAt;

  while (cursor <= now && dueTimes.length < hardLimit) {
    dueTimes.push(cursor);
    cursor = calculateNextRunMs(schedule, cursor);
  }

  return dueTimes;
}

function selectRunsToStart(
  dueTimes: number[],
  catchup: CatchupPolicy,
  maxRuns: number,
  availableSlots: number,
): { scheduledFor: number[]; advanceBy: number } | null {
  if (dueTimes.length === 0 || availableSlots <= 0) return null;

  if (catchup === 'none') {
    return {
      scheduledFor: [dueTimes[dueTimes.length - 1]],
      advanceBy: dueTimes.length,
    };
  }

  const runsToStart = catchup === 'all' ? Math.min(dueTimes.length, maxRuns, availableSlots) : 1;
  return {
    scheduledFor: dueTimes.slice(0, runsToStart),
    advanceBy: runsToStart,
  };
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

  async function executeCallback(
    jobKey: string,
    startedRun: PersistedJobRun,
    callback: RegisteredJob['callback'],
  ): Promise<void> {
    try {
      await callback();
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

  async function evaluateDue(jobKey: string): Promise<void> {
    if (jobLocks.has(jobKey)) return;
    const job = jobs.get(jobKey);
    if (!job) return;

    jobLocks.add(jobKey);

    try {
      const state = await store.getJob(jobKey);
      if (!state || !state.enabled) return;

      const availableSlots = Math.max(0, state.maxConcurrency - state.runningCount);
      if (availableSlots <= 0) return;

      const now = Date.now();
      const dueTimes = calculateDueTimes(
        job.schedule,
        state.nextRunAt,
        now,
        Math.max(1, job.catchupMaxRuns),
      );
      const selectedRuns = selectRunsToStart(
        dueTimes,
        job.catchup,
        job.catchupMaxRuns,
        availableSlots,
      );

      if (!selectedRuns) return;

      const nextRunAt = calculateNextDueRunMs(
        job.schedule,
        state.nextRunAt,
        selectedRuns.advanceBy,
      );
      const callback = job.callback;

      for (const scheduledFor of selectedRuns.scheduledFor) {
        const startedRun = await store.startRun({
          key: jobKey,
          scheduledFor,
          nextRunAt,
          now: Date.now(),
        });
        if (!startedRun) continue;

        const runPromise = executeCallback(jobKey, startedRun, callback).finally(() => {
          inFlightRuns.delete(runPromise);
        });
        inFlightRuns.add(runPromise);
      }
    } finally {
      jobLocks.delete(jobKey);
    }
  }

  async function tick(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(jobs.keys()).map((jobKey) => evaluateDue(jobKey)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        const error =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        logger.error({ event: 'scheduler.tick.failed', error }, 'scheduler tick failed');
      }
    }
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
      catchup: normalized.catchup,
      catchupMaxRuns: normalized.catchupMaxRuns,
      initialNextRunAt: normalized.immediate ? now : calculateNextRunMs(normalized.schedule, now),
      now,
    });

    logger.info(
      { event: 'scheduler.job.registered', key: normalized.key },
      'scheduled job registered',
    );

    if (timer) await evaluateDue(normalized.key);
  }

  async function unregisterJob(key: string): Promise<boolean> {
    jobs.delete(key);
    const removed = await store.unregisterJob(key);

    logger.info(
      { event: 'scheduler.job.unregistered', key, removed },
      'scheduled job unregistered',
    );

    return removed;
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
  };
}
