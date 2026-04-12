import { inArray } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';

type MemoryConfig = {
  enabled: boolean;
  autoExtract: boolean;
  embeddingProviderId: string;
  embeddingModelId: string;
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
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cachedConfig;
}
