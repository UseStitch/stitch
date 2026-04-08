import { inArray } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { userSettings, providerConfig } from '@/db/schema.js';
import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';
import { LocalEmbedder } from '@/memory/embedding/local-embedder.js';
import { ProviderEmbedder } from '@/memory/embedding/provider-embedder.js';
import { getEmbeddingModelDimensions } from '@/llm/provider/service.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-embedder' });

const DEFAULT_DIMENSIONS = 1536;

let cachedEmbedder: MemoryEmbedder | null = null;

export function resetEmbedder(): void {
  cachedEmbedder = null;
}

/**
 * Create a MemoryEmbedder based on the user's settings.
 *
 * - If `memory.embedding.providerId` is empty → use local all-MiniLM-L6-v2
 * - If a provider is configured → use that provider's embedding model via AI SDK
 *
 * The embedder is cached as a singleton and only recreated when settings change.
 */
export async function createEmbedder(): Promise<MemoryEmbedder> {
  if (cachedEmbedder) return cachedEmbedder;

  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, ['memory.embedding.providerId', 'memory.embedding.modelId']));

  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));
  const providerId = byKey.get('memory.embedding.providerId') || '';
  const modelId = byKey.get('memory.embedding.modelId') || '';

  if (!providerId || !modelId) {
    log.info('using local embedder (all-MiniLM-L6-v2)');
    cachedEmbedder = new LocalEmbedder();
    return cachedEmbedder;
  }

  const configs = await db
    .select()
    .from(providerConfig)
    .where(inArray(providerConfig.providerId, [providerId]));

  const config = configs.find((c) => c.providerId === providerId);
  if (!config) {
    log.warn({ providerId }, 'configured embedding provider not found, falling back to local');
    cachedEmbedder = new LocalEmbedder();
    return cachedEmbedder;
  }

  const dimensions = (await getEmbeddingModelDimensions(providerId, modelId)) ?? DEFAULT_DIMENSIONS;
  log.info({ providerId, modelId, dimensions }, 'using provider embedder');
  cachedEmbedder = new ProviderEmbedder(config.credentials, modelId, dimensions);
  return cachedEmbedder;
}
