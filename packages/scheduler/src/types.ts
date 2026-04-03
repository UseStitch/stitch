export type SchedulerLogger = {
  debug(extra: Record<string, unknown>, message: string): void;
  info(extra: Record<string, unknown>, message: string): void;
  warn(extra: Record<string, unknown>, message: string): void;
  error(extra: Record<string, unknown>, message: string): void;
};

export type IntervalSchedule = {
  type: 'interval';
  everyMs: number;
};

export type CronSchedule = {
  type: 'cron';
  expression: string;
  timezone?: 'UTC' | 'local';
};

export type JobSchedule = IntervalSchedule | CronSchedule;

export type CatchupPolicy = 'none' | 'one' | 'all';

export type RegisteredJob = {
  key: string;
  schedule: JobSchedule;
  callback: () => void | Promise<void>;
  enabled?: boolean;
  immediate?: boolean;
  maxConcurrency?: number;
  queueEnabled?: boolean;
  catchup?: CatchupPolicy;
  catchupMaxRuns?: number;
};

export type PersistedJob = {
  id: string;
  key: string;
  schedule: JobSchedule;
  enabled: boolean;
  maxConcurrency: number;
  queueEnabled: boolean;
  catchup: CatchupPolicy;
  catchupMaxRuns: number;
  nextRunAt: number;
  runningCount: number;
  queuedCount: number;
  totalRuns: number;
  totalFailures: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  updatedAt: number;
};

export type PersistedJobRun = {
  id: string;
  jobId: string;
  key: string;
  scheduledFor: number;
  startedAt: number;
};

export type JobStatus = {
  key: string;
  enabled: boolean;
  runningCount: number;
  queuedCount: number;
  maxConcurrency: number;
  nextRunAt: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  totalRuns: number;
  totalFailures: number;
};

export type SchedulerStore = {
  upsertJob(input: {
    key: string;
    schedule: JobSchedule;
    enabled: boolean;
    maxConcurrency: number;
    queueEnabled: boolean;
    catchup: CatchupPolicy;
    catchupMaxRuns: number;
    initialNextRunAt: number;
    now: number;
  }): Promise<PersistedJob>;
  getJob(key: string): Promise<PersistedJob | null>;
  listJobs(keys: string[]): Promise<PersistedJob[]>;
  enqueueDueRuns(input: {
    key: string;
    incrementBy: number;
    nextRunAt: number;
    now: number;
  }): Promise<PersistedJob | null>;
  startQueuedRun(input: { key: string; now: number }): Promise<PersistedJobRun | null>;
  completeRun(input: {
    runId: string;
    key: string;
    finishedAt: number;
    succeeded: boolean;
    errorMessage?: string;
  }): Promise<void>;
  unregisterJob(key: string): Promise<boolean>;
};
