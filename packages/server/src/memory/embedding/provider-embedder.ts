import { embed, embedMany, type EmbeddingModel } from 'ai';

import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';

/**
 * Embedding implementation using AI SDK providers (OpenAI, Google, etc.).
 * Wraps the AI SDK embed()/embedMany() functions into the MemoryEmbedder interface.
 */
export class ProviderEmbedder implements MemoryEmbedder {
  readonly dimensions: number;
  private readonly model: EmbeddingModel;

  constructor(credentials: ProviderCredentials, modelId: string, dimensions: number) {
    const embeddingProvider = createProvider(credentials);
    this.model = embeddingProvider.embeddingModel(modelId);
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({ model: this.model, value: text });
    return result.embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const result = await embedMany({ model: this.model, values: texts });
    return result.embeddings;
  }
}
