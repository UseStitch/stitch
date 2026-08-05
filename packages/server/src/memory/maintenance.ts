import * as Log from '@/lib/log.js';
import { ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { getMemoryConfig } from '@/memory/config.js';
import { consolidateMemories, type ConsolidationResult } from '@/memory/consolidation.js';

const log = Log.create({ service: 'memory-consolidation' });

export async function runMemoryMaintenance(): Promise<ServiceResult<ConsolidationResult>> {
  const config = await getMemoryConfig();
  if (!config.enabled) {
    return ok({
      status: 'noop',
      lastRunAt: new Date().toISOString(),
      summary: 'Memory is disabled.',
      candidateCount: 0,
      promotedCount: 0,
      rejectedCount: 0,
    });
  }
  const result = await consolidateMemories();
  log.info(result, 'memory consolidation complete');
  return ok(result);
}
