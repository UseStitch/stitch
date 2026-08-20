import type { MemoryConsolidationResult } from '@stitch/shared/memory/types';

import * as Log from '@/lib/log.js';
import { getMemoryConfig } from '@/memory/config.js';
import { consolidateMemories, noopResult } from '@/memory/consolidation.js';

const log = Log.create({ service: 'memory-consolidation' });

export async function runMemoryMaintenance(): Promise<MemoryConsolidationResult> {
  const config = await getMemoryConfig();
  if (!config.enabled) {
    return noopResult('Memory is disabled.', new Date().toISOString());
  }
  if (!config.consolidationEnabled) {
    return noopResult('Memory consolidation is disabled.', new Date().toISOString());
  }
  const result = await consolidateMemories({ maxCandidates: config.maxCandidatesPerRun });
  log.info(result, 'memory consolidation complete');
  return result;
}
