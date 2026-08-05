import { getEmbeddingModelsFromRegistry } from '@/models/embedding/registry.js';
import type { ResolvedEmbeddingProvider } from '@/models/embedding/schema.js';

/** Returns embedding models from the Stitch embedding registry. */
export async function getEmbeddingModels(): Promise<Record<string, ResolvedEmbeddingProvider>> {
  return await getEmbeddingModelsFromRegistry();
}
