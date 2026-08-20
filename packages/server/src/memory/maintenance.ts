import type { MemoryConsolidationResult } from '@stitch/shared/memory/types';

import * as Log from '@/lib/log.js';
import { getMemoryConfig } from '@/memory/config.js';
import { consolidateMemories } from '@/memory/consolidation.js';

const log = Log.create({ service: 'memory-consolidation' });

export async function runMemoryMaintenance(): Promise<MemoryConsolidationResult> {
  const config = await getMemoryConfig();
  if (!config.enabled) {
    return {
      status: 'noop',
      lastRunAt: new Date().toISOString(),
      summary: 'Memory is disabled.',
      candidateCount: 0,
      promotedCount: 0,
      rejectedCount: 0,
    };
  }
  if (!config.consolidationEnabled) {
    return {
      status: 'noop',
      lastRunAt: new Date().toISOString(),
      summary: 'Memory consolidation is disabled.',
      candidateCount: 0,
      promotedCount: 0,
      rejectedCount: 0,
    };
  }
  const result = await consolidateMemories({ maxCandidates: config.maxCandidatesPerRun });
  log.info(result, 'memory consolidation complete');
  return result;
}
