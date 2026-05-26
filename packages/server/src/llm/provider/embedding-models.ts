import { getEmbeddingModelsFromRegistry } from '@/llm/provider/embedding-registry.js';
import type { RawProvider, RawModel } from '@/llm/provider/models.js';

/** Returns embedding models from the Stitch embedding registry. */
export async function getEmbeddingModels(): Promise<Record<string, RawProvider>> {
  return await getEmbeddingModelsFromRegistry();
}

/** Returns the output dimension of an embedding model, or undefined if unknown. */
export function getEmbeddingDimensions(model: RawModel): number | undefined {
  return model.limit?.output;
}
