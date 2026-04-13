import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { deduplicateMemories, getMemoryStats, pruneStaleMemories } from '@/memory/service.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-maintenance' });

type MaintenanceResult = {
  pruned: number;
  deduplicated: number;
  stats: Awaited<ReturnType<typeof getMemoryStats>>;
};

export async function runMemoryMaintenance(): Promise<MaintenanceResult> {
  const config = await getMemoryConfig();

  if (!isMemoryActive(config)) {
    log.info('memory maintenance skipped — memory not active');
    return { pruned: 0, deduplicated: 0, stats: null };
  }

  log.info('starting memory maintenance');

  // Phase 1: Autoprune stale/low-value memories if enabled
  let pruned = 0;
  if (config.autoprune) {
    const beforeStats = await getMemoryStats();
    await pruneStaleMemories({ maxMemories: config.maxMemories, staleDays: config.staleDays });
    const afterStats = await getMemoryStats();
    pruned = Math.max(0, beforeStats.total - afterStats.total);
    log.info({ pruned }, 'memory maintenance: pruning complete');
  }

  // Phase 2: Dedup sweep — remove near-duplicate memories
  const deduplicated = await deduplicateMemories();
  log.info({ deduplicated }, 'memory maintenance: dedup sweep complete');

  // Phase 3: Emit stats
  const stats = await getMemoryStats();
  log.info(
    {
      total: stats.total,
      pinned: stats.pinned,
      stale: stats.stale,
      byCategory: stats.byCategory,
      byConfidence: stats.byConfidence,
      avgAccessCount: stats.avgAccessCount,
    },
    'memory maintenance: stats',
  );

  return { pruned, deduplicated, stats };
}
