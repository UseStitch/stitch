import { inArray } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import * as Log from '@/lib/log.js';
import { getEmbeddingModelDimensions } from '@/llm/provider/service.js';
import {
  getMemoryConfig,
  hasConfiguredEmbeddingModel,
  invalidateMemoryConfig,
} from '@/memory/config.js';
import type { Embedder } from '@/models/embedding/embedder.js';
import { ProviderEmbedder } from '@/models/embedding/provider-embedder.js';

const log = Log.create({ service: 'embedder' });

const DEFAULT_DIMENSIONS = 1536;

let cachedEmbedder: Embedder | null = null;

export function resetEmbedder(): void {
  cachedEmbedder = null;
  invalidateMemoryConfig();
}

/**
 * Create an Embedder based on the user's settings.
 *
 * Uses the configured provider embedding model via AI SDK.
 *
 * The embedder is cached as a singleton and only recreated when settings change.
 * Reads embedding config from the already-cached MemoryConfig to avoid a duplicate DB query.
 */
export async function createEmbedder(): Promise<Embedder> {
  if (cachedEmbedder) return cachedEmbedder;

  const config = await getMemoryConfig();
  if (!hasConfiguredEmbeddingModel(config)) {
    throw new Error('Memory embedding model is not configured');
  }

  const providerId = config.embeddingProviderId;
  const modelId = config.embeddingModelId;

  const db = getDb();
  const configs = await db
    .select()
    .from(providerConfig)
    .where(inArray(providerConfig.providerId, [providerId]));

  const config_ = configs.find((c) => c.providerId === providerId);
  if (!config_) {
    throw new Error(`Configured embedding provider is unavailable: ${providerId}`);
  }

  const dimensions = (await getEmbeddingModelDimensions(providerId, modelId)) ?? DEFAULT_DIMENSIONS;
  log.info({ providerId, modelId, dimensions }, 'using provider embedder');
  cachedEmbedder = new ProviderEmbedder(config_.credentials, providerId, modelId, dimensions);
  return cachedEmbedder;
}
