import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

import { createScheduler } from './scheduler.js';

import type { JobSchedule, PersistedJob, PersistedJobRun, SchedulerLogger, SchedulerStore } from './types.js';

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z').getTime();
let mockNow = BASE_TIME;
const originalDateNow = Date.now;

async function advanceTime(ms: number, step = 10): Promise<void> {
  let remaining = ms;
  while (remaining > 0) {
    const tick = Math.min(step, remaining);
    mockNow += tick;
    jest.advanceTimersByTime(tick);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    remaining -= tick;
  }
}

function makeLogger(): SchedulerLogger {
  const noop = () => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

class MemoryStore implements SchedulerStore {
  private jobs = new Map<string, PersistedJob>();
  private runs = new Map<string, PersistedJobRun>();
  private nextJobId = 1;
  private nextRunId = 1;

  async upsertJob(input: {
    key: string;
    schedule: JobSchedule;
    enabled: boolean;
    maxConcurrency: number;
    catchup: 'none' | 'one' | 'all';
    catchupMaxRuns: number;
    initialNextRunAt: number;
    now: number;
  }): Promise<PersistedJob> {
    const existing = this.jobs.get(input.key);

    if (existing) {
      const next: PersistedJob = {
        ...existing,
        schedule: input.schedule,
        enabled: input.enabled,
        maxConcurrency: input.maxConcurrency,
        catchup: input.catchup,
        catchupMaxRuns: input.catchupMaxRuns,
        runningCount: 0,
        updatedAt: input.now,
      };
      this.jobs.set(input.key, next);
      return next;
    }

    const row: PersistedJob = {
      id: `job_${this.nextJobId++}`,
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
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      updatedAt: input.now,
    };

    this.jobs.set(input.key, row);
    return row;
  }

  async getJob(key: string): Promise<PersistedJob | null> {
    return this.jobs.get(key) ?? null;
  }

  async startRun(input: {
    key: string;
    scheduledFor: number;
    nextRunAt: number;
    now: number;
  }): Promise<PersistedJobRun | null> {
    const row = this.jobs.get(input.key);
    if (!row) return null;
    if (!row.enabled) return null;
    if (row.runningCount >= row.maxConcurrency) return null;

    const run: PersistedJobRun = {
      id: `run_${this.nextRunId++}`,
      jobId: row.id,
      key: row.key,
      scheduledFor: input.scheduledFor,
      startedAt: input.now,
    };

    this.runs.set(run.id, run);
    this.jobs.set(input.key, {
      ...row,
      runningCount: row.runningCount + 1,
      nextRunAt: input.nextRunAt,
      lastRunAt: input.now,
      totalRuns: row.totalRuns + 1,
      updatedAt: input.now,
    });

    return run;
  }

  async completeRun(input: {
    runId: string;
    key: string;
    finishedAt: number;
    succeeded: boolean;
    errorMessage?: string;
  }): Promise<void> {
    this.runs.delete(input.runId);
    const row = this.jobs.get(input.key);
    if (!row) return;

    this.jobs.set(input.key, {
      ...row,
      runningCount: Math.max(0, row.runningCount - 1),
      totalFailures: input.succeeded ? row.totalFailures : row.totalFailures + 1,
      lastSuccessAt: input.succeeded ? input.finishedAt : row.lastSuccessAt,
      lastErrorAt: input.succeeded ? row.lastErrorAt : input.finishedAt,
      lastErrorMessage: input.succeeded ? null : (input.errorMessage ?? 'unknown error'),
      updatedAt: input.finishedAt,
    });
  }

  async unregisterJob(key: string): Promise<boolean> {
    const row = this.jobs.get(key);
    if (!row) return false;

    this.jobs.set(key, { ...row, enabled: false, runningCount: 0, updatedAt: mockNow });
    return true;
  }
}

describe('scheduler', () => {
  beforeEach(() => {
    mockNow = BASE_TIME;
    Date.now = () => mockNow;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Date.now = originalDateNow;
  });

  test('runs queued interval jobs and updates status', async () => {
    const store = new MemoryStore();
    const callback = mock();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 25 });

    await scheduler.registerJob({
      key: 'interval-job',
      schedule: { type: 'interval', everyMs: 100 },
      callback,
      immediate: true,
      maxConcurrency: 1,
    });

    await scheduler.start();
    await advanceTime(240, 25);
    await scheduler.stop();

    expect(callback).toHaveBeenCalledTimes(3);

    const status = await store.getJob('interval-job');
    expect(status).not.toBeNull();
    expect(status?.runningCount).toBe(0);
    expect(status?.totalRuns).toBe(3);
  });

  test('respects maxConcurrency without queueing blocked runs', async () => {
    const store = new MemoryStore();
    const callback = mock(async () => {
      await advanceTime(120);
    });

    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 20 });

    await scheduler.registerJob({
      key: 'concurrency-job',
      schedule: { type: 'interval', everyMs: 30 },
      callback,
      immediate: true,
      maxConcurrency: 1,
      catchup: 'all',
      catchupMaxRuns: 20,
    });

    await scheduler.start();
    await advanceTime(260);
    await scheduler.stop();

    const status = await store.getJob('concurrency-job');
    expect(status).not.toBeNull();
    expect(status!.totalRuns).toBeGreaterThanOrEqual(2);
    expect(status!.runningCount).toBe(0);
  });

  test('catchup none drops backlog but runs the current due occurrence', async () => {
    const store = new MemoryStore();
    const callback = mock();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 1_000 });

    await scheduler.registerJob({
      key: 'catchup-none',
      schedule: { type: 'interval', everyMs: 1_000 },
      callback,
      maxConcurrency: 1,
      catchup: 'none',
    });

    await scheduler.start();
    await advanceTime(1_100, 100);

    await scheduler.stop();
    await advanceTime(5_000, 500);

    await scheduler.start();
    await advanceTime(1_100, 100);
    await scheduler.stop();

    expect(callback).toHaveBeenCalledTimes(3);
  });

  test('catchup all replays backlog up to limit', async () => {
    const store = new MemoryStore();
    const callback = mock();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 500 });

    await scheduler.registerJob({
      key: 'catchup-all',
      schedule: { type: 'interval', everyMs: 500 },
      callback,
      maxConcurrency: 5,
      catchup: 'all',
      catchupMaxRuns: 4,
    });

    await scheduler.start();
    await advanceTime(600, 50);
    await scheduler.stop();

    await advanceTime(5_000, 500);

    await scheduler.start();
    await Promise.resolve();
    await scheduler.stop();

    expect(callback).toHaveBeenCalledTimes(5);
  });

  test('supports cron schedule', async () => {
    const store = new MemoryStore();
    const callback = mock();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 5_000 });

    await scheduler.registerJob({
      key: 'cron-job',
      schedule: { type: 'cron', expression: '*/1 * * * *', timezone: 'UTC' },
      callback,
      maxConcurrency: 1,
      catchup: 'one',
    });

    await scheduler.start();
    await advanceTime(130_000, 5_000);
    await scheduler.stop();

    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('unregister disables persisted job status', async () => {
    const store = new MemoryStore();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 100 });

    await scheduler.registerJob({ key: 'remove-me', schedule: { type: 'interval', everyMs: 100 }, callback: () => {} });

    const removed = await scheduler.unregisterJob('remove-me');
    const status = await store.getJob('remove-me');

    expect(removed).toBe(true);
    expect(status?.enabled).toBe(false);
  });

  test('registration recovers stale running counts from previous process', async () => {
    const store = new MemoryStore();
    const callback = mock();
    const scheduler = createScheduler({ store, logger: makeLogger(), pollIntervalMs: 25 });

    await scheduler.registerJob({
      key: 'recover-me',
      schedule: { type: 'interval', everyMs: 100 },
      callback: () => {},
      maxConcurrency: 1,
    });
    const staleRun = await store.startRun({
      key: 'recover-me',
      scheduledFor: BASE_TIME,
      nextRunAt: BASE_TIME,
      now: BASE_TIME,
    });
    expect(staleRun).not.toBeNull();

    await scheduler.registerJob({
      key: 'recover-me',
      schedule: { type: 'interval', everyMs: 100 },
      callback,
      immediate: true,
      maxConcurrency: 1,
    });

    await scheduler.start();
    await advanceTime(120, 25);
    await scheduler.stop();

    expect(callback).toHaveBeenCalled();
    const status = await store.getJob('recover-me');
    expect(status?.runningCount).toBe(0);
  });
});
