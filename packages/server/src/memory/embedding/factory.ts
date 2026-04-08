import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema.js';
import { inArray } from 'drizzle-orm';
import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';
import { LocalEmbedder } from '@/memory/embedding/local-embedder.js';
import { ProviderEmbedder } from '@/memory/embedding/provider-embedder.js';
import { getEmbeddingModelDimensions } from '@/llm/provider/service.js';
import { invalidateMemoryConfig, getMemoryConfig } from '@/memory/config.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-embedder' });

const DEFAULT_DIMENSIONS = 1536;

let cachedEmbedder: MemoryEmbedder | null = null;

export function resetEmbedder(): void {
  cachedEmbedder = null;
  invalidateMemoryConfig();
}

/**
 * Create a MemoryEmbedder based on the user's settings.
 *
 * - If `memory.embedding.providerId` is empty → use local all-MiniLM-L6-v2
 * - If a provider is configured → use that provider's embedding model via AI SDK
 *
 * The embedder is cached as a singleton and only recreated when settings change.
 * Reads embedding config from the already-cached MemoryConfig to avoid a duplicate DB query.
 */
export async function createEmbedder(): Promise<MemoryEmbedder> {
  if (cachedEmbedder) return cachedEmbedder;

  const config = await getMemoryConfig();
  const providerId = config.embeddingProviderId;
  const modelId = config.embeddingModelId;

  if (!providerId || !modelId) {
    log.info('using local embedder (all-MiniLM-L6-v2)');
    cachedEmbedder = new LocalEmbedder();
    return cachedEmbedder;
  }

  const db = getDb();
  const configs = await db
    .select()
    .from(providerConfig)
    .where(inArray(providerConfig.providerId, [providerId]));

  const config_ = configs.find((c) => c.providerId === providerId);
  if (!config_) {
    log.warn({ providerId }, 'configured embedding provider not found, falling back to local');
    cachedEmbedder = new LocalEmbedder();
    return cachedEmbedder;
  }

  const dimensions = (await getEmbeddingModelDimensions(providerId, modelId)) ?? DEFAULT_DIMENSIONS;
  log.info({ providerId, modelId, dimensions }, 'using provider embedder');
  cachedEmbedder = new ProviderEmbedder(config_.credentials, modelId, dimensions);
  return cachedEmbedder;
}
