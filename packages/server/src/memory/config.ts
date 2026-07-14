import { getSettings } from '@/settings/service.js';

type MemoryConfig = {
  enabled: boolean;
  autoExtract: boolean;
  embeddingProviderId: string;
  embeddingModelId: string;
  maxFactsPerTurn: number;
  minMessageLength: number;
  confidenceFilter: 'stated' | 'all' | 'stated+confirmed';
  importanceMinScore: number;
  maxFactsPerSession: number;
  minTurnsBetweenWrites: number;
  maxMemories: number;
  staleDays: number;
  autoprune: boolean;
  dedupThreshold: number;
  retrievalMaxResults: number;
  retrievalMinScore: number;
  retrievalRecencyBoost: boolean;
};

export function hasConfiguredEmbeddingModel(
  config: Pick<MemoryConfig, 'embeddingProviderId' | 'embeddingModelId'>,
): boolean {
  return config.embeddingProviderId.trim().length > 0 && config.embeddingModelId.trim().length > 0;
}

export function isMemoryActive(config: MemoryConfig): boolean {
  return config.enabled && hasConfiguredEmbeddingModel(config);
}

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

  const s = await getSettings([
    'memory.enabled',
    'memory.autoExtract',
    'memory.embedding.providerId',
    'memory.embedding.modelId',
    'memory.extraction.maxFactsPerTurn',
    'memory.extraction.minMessageLength',
    'memory.extraction.confidenceFilter',
    'memory.extraction.importanceMinScore',
    'memory.extraction.maxFactsPerSession',
    'memory.extraction.minTurnsBetweenWrites',
    'memory.retention.maxMemories',
    'memory.retention.staleDays',
    'memory.retention.autoprune',
    'memory.retention.dedupThreshold',
    'memory.retrieval.maxResults',
    'memory.retrieval.minScore',
    'memory.retrieval.recencyBoost',
  ] as const);

  cachedConfig = {
    enabled: s['memory.enabled'],
    autoExtract: s['memory.autoExtract'],
    embeddingProviderId: s['memory.embedding.providerId'],
    embeddingModelId: s['memory.embedding.modelId'],
    maxFactsPerTurn: s['memory.extraction.maxFactsPerTurn'],
    minMessageLength: s['memory.extraction.minMessageLength'],
    confidenceFilter: s['memory.extraction.confidenceFilter'],
    importanceMinScore: s['memory.extraction.importanceMinScore'],
    maxFactsPerSession: s['memory.extraction.maxFactsPerSession'],
    minTurnsBetweenWrites: s['memory.extraction.minTurnsBetweenWrites'],
    maxMemories: s['memory.retention.maxMemories'],
    staleDays: s['memory.retention.staleDays'],
    autoprune: s['memory.retention.autoprune'],
    dedupThreshold: s['memory.retention.dedupThreshold'],
    retrievalMaxResults: s['memory.retrieval.maxResults'],
    retrievalMinScore: s['memory.retrieval.minScore'],
    retrievalRecencyBoost: s['memory.retrieval.recencyBoost'],
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cachedConfig;
}
