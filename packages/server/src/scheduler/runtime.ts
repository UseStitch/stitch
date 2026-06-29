import { createScheduler } from '@stitch/scheduler';
import type { RegisteredJob } from '@stitch/scheduler';

import { refreshExpiringTokens } from '@/connectors/auth/token-refresh.js';
import * as Log from '@/lib/log.js';
import { refreshMcpRegistryCache } from '@/mcp/registry-service.js';
import { refreshExpiringMcpTokens } from '@/mcp/service.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { runMemoryMaintenance } from '@/memory/maintenance.js';
import * as EmbeddingRegistry from '@/models/embedding/registry.js';
import * as ModelsDev from '@/models/llm/registry.js';
import * as SttRegistry from '@/models/stt/registry.js';
import { createSchedulerStore } from '@/scheduler/store.js';
import * as ToolTruncation from '@/tools/runtime/truncation.js';

const log = Log.create({ service: 'scheduler' });

const HOUR_MS = 60 * 60 * 1000;
const LOG_CLEANUP_INTERVAL_MS = 24 * HOUR_MS;
const MEMORY_MAINTENANCE_INTERVAL_MS = 6 * HOUR_MS;
const MODELS_REFRESH_INTERVAL_MS = 1 * HOUR_MS;
const STT_REGISTRY_REFRESH_INTERVAL_MS = 6 * HOUR_MS;
const EMBEDDING_REGISTRY_REFRESH_INTERVAL_MS = 6 * HOUR_MS;
const TOOL_OUTPUT_CLEANUP_INTERVAL_MS = 1 * HOUR_MS;
const MCP_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const MCP_REGISTRY_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 60 * 1000;

let scheduler: ReturnType<typeof createScheduler> | null = null;

function getBuiltinJobs(): RegisteredJob[] {
  const jobs: RegisteredJob[] = [
    {
      key: 'memory-maintenance',
      schedule: { type: 'interval', everyMs: MEMORY_MAINTENANCE_INTERVAL_MS },
      callback: async () => {
        await runMemoryMaintenance();
      },
    },
    {
      key: 'log-cleanup',
      schedule: { type: 'interval', everyMs: LOG_CLEANUP_INTERVAL_MS },
      callback: () => Log.cleanup(),
      catchup: 'none',
    },
    {
      key: 'models-refresh',
      schedule: { type: 'interval', everyMs: MODELS_REFRESH_INTERVAL_MS },
      callback: () => ModelsDev.refresh(),
      immediate: true,
    },
    {
      key: 'stt-registry-refresh',
      schedule: { type: 'interval', everyMs: STT_REGISTRY_REFRESH_INTERVAL_MS },
      callback: () => SttRegistry.refresh(),
      immediate: true,
    },
    {
      key: 'embedding-registry-refresh',
      schedule: { type: 'interval', everyMs: EMBEDDING_REGISTRY_REFRESH_INTERVAL_MS },
      callback: () => EmbeddingRegistry.refresh(),
      immediate: true,
    },
    {
      key: 'tool-output-cleanup',
      schedule: { type: 'interval', everyMs: TOOL_OUTPUT_CLEANUP_INTERVAL_MS },
      callback: () => ToolTruncation.cleanup(),
      catchup: 'none',
    },
    {
      key: 'mcp-refresh',
      schedule: { type: 'interval', everyMs: MCP_REFRESH_INTERVAL_MS },
      callback: () => refreshMcpToolsets({ refreshTools: true }),
    },
    {
      key: 'mcp-registry-refresh',
      schedule: { type: 'interval', everyMs: MCP_REGISTRY_REFRESH_INTERVAL_MS },
      callback: async () => {
        await refreshMcpRegistryCache({ force: true });
      },
      immediate: true,
    },
    {
      key: 'token-refresh',
      schedule: { type: 'interval', everyMs: TOKEN_REFRESH_INTERVAL_MS },
      callback: () => refreshExpiringTokens(),
    },
    {
      key: 'mcp-token-refresh',
      schedule: { type: 'interval', everyMs: TOKEN_REFRESH_INTERVAL_MS },
      callback: () => refreshExpiringMcpTokens(),
    },
  ];

  return jobs.map((job) => ({ maxConcurrency: 1, catchup: 'one', ...job }));
}

export async function startScheduler(): Promise<void> {
  if (scheduler) return;

  scheduler = createScheduler({
    logger: log,
    store: createSchedulerStore(),
    pollIntervalMs: 1_000,
  });
  const activeScheduler = scheduler;

  await Promise.all(getBuiltinJobs().map((job) => activeScheduler.registerJob(job)));

  await activeScheduler.start();
}

export async function stopScheduler(): Promise<void> {
  if (!scheduler) return;
  await scheduler.stop();
  scheduler = null;
}

export async function registerSchedulerJob(input: RegisteredJob): Promise<void> {
  if (!scheduler) {
    throw new Error('Scheduler is not started');
  }

  await scheduler.registerJob(input);
}

export async function unregisterSchedulerJob(key: string): Promise<void> {
  if (!scheduler) return;

  await scheduler.unregisterJob(key);
}
