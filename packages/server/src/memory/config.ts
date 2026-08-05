import { memoryFileStore } from '@/memory/file-store.js';
import { getSettings } from '@/settings/service.js';

type MemoryConfig = {
  enabled: boolean;
  autoExtract: boolean;
  maxFactsPerTurn: number;
  minMessageLength: number;
  maxFactsPerSession: number;
  minTurnsBetweenWrites: number;
  extractFromAutomations: boolean;
  memoryCharLimit: number;
  userCharLimit: number;
  consolidationEnabled: boolean;
  maxCandidatesPerRun: number;
};

const CACHE_TTL_MS = 10_000;
let cachedConfig: MemoryConfig | null = null;
let cacheExpiresAt = 0;

export function invalidateMemoryConfig(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

export async function getMemoryConfig(): Promise<MemoryConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) return cachedConfig;
  const settings = await getSettings([
    'memory.enabled',
    'memory.autoExtract',
    'memory.extraction.maxFactsPerTurn',
    'memory.extraction.minMessageLength',
    'memory.extraction.maxFactsPerSession',
    'memory.extraction.minTurnsBetweenWrites',
    'memory.extraction.fromAutomations',
    'memory.curated.memoryCharLimit',
    'memory.curated.userCharLimit',
    'memory.consolidation.enabled',
    'memory.consolidation.maxCandidatesPerRun',
  ] as const);

  cachedConfig = {
    enabled: settings['memory.enabled'],
    autoExtract: settings['memory.autoExtract'],
    maxFactsPerTurn: settings['memory.extraction.maxFactsPerTurn'],
    minMessageLength: settings['memory.extraction.minMessageLength'],
    maxFactsPerSession: settings['memory.extraction.maxFactsPerSession'],
    minTurnsBetweenWrites: settings['memory.extraction.minTurnsBetweenWrites'],
    extractFromAutomations: settings['memory.extraction.fromAutomations'],
    memoryCharLimit: settings['memory.curated.memoryCharLimit'],
    userCharLimit: settings['memory.curated.userCharLimit'],
    consolidationEnabled: settings['memory.consolidation.enabled'],
    maxCandidatesPerRun: settings['memory.consolidation.maxCandidatesPerRun'],
  };
  memoryFileStore.setLimits(cachedConfig.memoryCharLimit, cachedConfig.userCharLimit);
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedConfig;
}
