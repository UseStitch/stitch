import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { deduplicateMemories, getMemoryStats, pruneStaleMemories } from '@/memory/service.js';
import * as Log from '@/lib/log.js';
import { isServiceError, ok, type ServiceResult } from '@/lib/service-result.js';

const log = Log.create({ service: 'memory-maintenance' });

type MaintenanceResult = {
  pruned: number;
  deduplicated: number;
  stats: any;
};

export async function runMemoryMaintenance(): Promise<ServiceResult<MaintenanceResult>> {
  const config = await getMemoryConfig();

  if (!isMemoryActive(config)) {
    log.info('memory maintenance skipped — memory not active');
    return ok({ pruned: 0, deduplicated: 0, stats: null });
  }

  log.info('starting memory maintenance');

  let pruned = 0;
  if (config.autoprune) {
    const beforeResult = await getMemoryStats();
    const beforeTotal = isServiceError(beforeResult) ? 0 : beforeResult.data.total;
    await pruneStaleMemories({ maxMemories: config.maxMemories, staleDays: config.staleDays });
    const afterResult = await getMemoryStats();
    const afterTotal = isServiceError(afterResult) ? 0 : afterResult.data.total;
    pruned = Math.max(0, beforeTotal - afterTotal);
    log.info({ pruned }, 'memory maintenance: pruning complete');
  }

  const deduplicated = await deduplicateMemories();
  log.info({ deduplicated }, 'memory maintenance: dedup sweep complete');

  const statsResult = await getMemoryStats();
  const stats = isServiceError(statsResult) ? null : statsResult.data;
  if (stats) {
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
  }

  return ok({ pruned, deduplicated, stats });
}
