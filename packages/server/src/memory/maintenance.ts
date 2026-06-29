import * as Log from '@/lib/log.js';
import { ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { consolidateMemories } from '@/memory/consolidation.js';
import type { ConsolidationResult } from '@/memory/consolidation.js';
import { deduplicateMemories, getMemoryStats, pruneStaleMemories } from '@/memory/service.js';
import type { MemoryStats } from '@/memory/service.js';

const log = Log.create({ service: 'memory-maintenance' });

type MaintenanceResult = {
  pruned: number;
  deduplicated: number;
  consolidated: ConsolidationResult;
  stats: MemoryStats | null;
};

export async function runMemoryMaintenance(): Promise<ServiceResult<MaintenanceResult>> {
  const config = await getMemoryConfig();

  if (!isMemoryActive(config)) {
    log.info('memory maintenance skipped — memory not active');
    return ok({
      pruned: 0,
      deduplicated: 0,
      consolidated: { groupsReviewed: 0, added: 0, updated: 0, deleted: 0, skipped: 0 },
      stats: null,
    });
  }

  log.info('starting memory maintenance');

  // Phase 1: Autoprune stale/low-value memories if enabled
  let pruned = 0;
  if (config.autoprune) {
    const beforeResult = await getMemoryStats();
    await pruneStaleMemories({ maxMemories: config.maxMemories, staleDays: config.staleDays });
    const afterResult = await getMemoryStats();
    const beforeTotal = beforeResult.error ? 0 : beforeResult.data.total;
    const afterTotal = afterResult.error ? 0 : afterResult.data.total;
    pruned = Math.max(0, beforeTotal - afterTotal);
    log.info({ pruned }, 'memory maintenance: pruning complete');
  }

  // Phase 2: Dedup sweep — remove near-duplicate memories
  const deduplicated = await deduplicateMemories();
  log.info({ deduplicated }, 'memory maintenance: dedup sweep complete');

  // Phase 3: Reflective consolidation of related semantic memories
  const consolidated = await consolidateMemories();
  log.info(consolidated, 'memory maintenance: consolidation complete');

  // Phase 4: Emit stats
  const statsResult = await getMemoryStats();
  const stats = statsResult.error ? null : statsResult.data;
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

  return ok({ pruned, deduplicated, consolidated, stats });
}
