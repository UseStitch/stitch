import { getEmbeddingModelsFromRegistry } from '@/models/embedding/registry.js';
import type {
  ResolvedEmbeddingModel,
  ResolvedEmbeddingProvider,
} from '@/models/embedding/schema.js';

/** Returns embedding models from the Stitch embedding registry. */
export async function getEmbeddingModels(): Promise<Record<string, ResolvedEmbeddingProvider>> {
  return await getEmbeddingModelsFromRegistry();
}

/** Returns the output dimension of an embedding model, or undefined if unknown. */
export function getEmbeddingDimensions(model: ResolvedEmbeddingModel): number | undefined {
  return model.dimensions;
}
