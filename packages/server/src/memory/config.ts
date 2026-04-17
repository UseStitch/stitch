import { inArray } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';

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

const MEMORY_SETTING_KEYS = [
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
  'memory.retrieval.maxResults',
  'memory.retrieval.minScore',
  'memory.retrieval.recencyBoost',
] as const;

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

  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, [...MEMORY_SETTING_KEYS]));

  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));

  cachedConfig = {
    enabled: byKey.get('memory.enabled') === 'true',
    autoExtract: byKey.get('memory.autoExtract') !== 'false',
    embeddingProviderId: byKey.get('memory.embedding.providerId') ?? '',
    embeddingModelId: byKey.get('memory.embedding.modelId') ?? '',
    maxFactsPerTurn: Number.parseInt(byKey.get('memory.extraction.maxFactsPerTurn') ?? '1', 10),
    minMessageLength: Number.parseInt(byKey.get('memory.extraction.minMessageLength') ?? '100', 10),
    confidenceFilter: (byKey.get('memory.extraction.confidenceFilter') ??
      'stated') as MemoryConfig['confidenceFilter'],
    importanceMinScore: Number.parseFloat(
      byKey.get('memory.extraction.importanceMinScore') ?? '0.7',
    ),
    maxFactsPerSession: Number.parseInt(
      byKey.get('memory.extraction.maxFactsPerSession') ?? '20',
      10,
    ),
    minTurnsBetweenWrites: Number.parseInt(
      byKey.get('memory.extraction.minTurnsBetweenWrites') ?? '3',
      10,
    ),
    maxMemories: Number.parseInt(byKey.get('memory.retention.maxMemories') ?? '150', 10),
    staleDays: Number.parseInt(byKey.get('memory.retention.staleDays') ?? '30', 10),
    autoprune: byKey.get('memory.retention.autoprune') !== 'false',
    retrievalMaxResults: Number.parseInt(byKey.get('memory.retrieval.maxResults') ?? '3', 10),
    retrievalMinScore: Number.parseFloat(byKey.get('memory.retrieval.minScore') ?? '0.6'),
    retrievalRecencyBoost: byKey.get('memory.retrieval.recencyBoost') !== 'false',
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cachedConfig;
}
