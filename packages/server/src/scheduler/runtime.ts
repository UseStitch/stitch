import { createScheduler } from '@stitch/scheduler';
import type { JobSchedule, RegisteredJob } from '@stitch/scheduler';

import { refreshExpiringTokens } from '@/connectors/auth/token-refresh.js';
import * as Log from '@/lib/log.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import * as ModelsDev from '@/llm/provider/models.js';
import { createSchedulerStore } from '@/scheduler/store.js';
import * as ToolTruncation from '@/tools/runtime/truncation.js';

const log = Log.create({ service: 'scheduler' });

const HOUR_MS = 60 * 60 * 1000;
const LOG_CLEANUP_INTERVAL_MS = 24 * HOUR_MS;
const MODELS_REFRESH_INTERVAL_MS = 1 * HOUR_MS;
const TOOL_OUTPUT_CLEANUP_INTERVAL_MS = 1 * HOUR_MS;
const MCP_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 60 * 1000;

let scheduler: ReturnType<typeof createScheduler> | null = null;

export async function startScheduler(): Promise<void> {
  if (scheduler) return;

  scheduler = createScheduler({
    logger: {
      debug: (extra, message) => log.debug(extra, message),
      info: (extra, message) => log.info(extra, message),
      warn: (extra, message) => log.warn(extra, message),
      error: (extra, message) => log.error(extra, message),
    },
    store: createSchedulerStore(),
    pollIntervalMs: 1_000,
  });

  await scheduler.registerJob({
    key: 'log-cleanup',
    schedule: { type: 'interval', everyMs: LOG_CLEANUP_INTERVAL_MS },
    callback: () => Log.cleanup(),
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'none',
  });

  await scheduler.registerJob({
    key: 'models-refresh',
    schedule: { type: 'interval', everyMs: MODELS_REFRESH_INTERVAL_MS },
    callback: () => ModelsDev.refresh(),
    immediate: true,
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'one',
  });

  await scheduler.registerJob({
    key: 'tool-output-cleanup',
    schedule: { type: 'interval', everyMs: TOOL_OUTPUT_CLEANUP_INTERVAL_MS },
    callback: () => ToolTruncation.cleanup(),
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'none',
  });

  await scheduler.registerJob({
    key: 'mcp-refresh',
    schedule: { type: 'interval', everyMs: MCP_REFRESH_INTERVAL_MS },
    callback: () => refreshMcpToolsets({ refreshTools: true }),
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'one',
  });

  await scheduler.registerJob({
    key: 'token-refresh',
    schedule: { type: 'interval', everyMs: TOKEN_REFRESH_INTERVAL_MS },
    callback: () => refreshExpiringTokens(),
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'one',
  });

  await scheduler.start();
}

export async function stopScheduler(): Promise<void> {
  if (!scheduler) return;
  await scheduler.stop();
  scheduler = null;
}

export async function registerSchedulerJob(input: {
  key: string;
  schedule: JobSchedule;
  callback: RegisteredJob['callback'];
  immediate?: boolean;
  maxConcurrency?: number;
  queueEnabled?: boolean;
  catchup?: RegisteredJob['catchup'];
  catchupMaxRuns?: number;
}): Promise<void> {
  if (!scheduler) {
    throw new Error('Scheduler is not started');
  }

  await scheduler.registerJob({
    key: input.key,
    schedule: input.schedule,
    callback: input.callback,
    immediate: input.immediate,
    maxConcurrency: input.maxConcurrency,
    queueEnabled: input.queueEnabled,
    catchup: input.catchup,
    catchupMaxRuns: input.catchupMaxRuns,
  });
}

export async function unregisterSchedulerJob(key: string): Promise<void> {
  if (!scheduler) {
    throw new Error('Scheduler is not started');
  }

  await scheduler.unregisterJob(key);
}
