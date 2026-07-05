import { embed, embedMany, type EmbeddingModel } from 'ai';

import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import type { EmbedManyResult, EmbedResult, Embedder } from '@/models/embedding/embedder.js';

/**
 * Embedding implementation using AI SDK providers (OpenAI, Google, etc.).
 * Wraps the AI SDK embed()/embedMany() functions into the Embedder interface.
 */
export class ProviderEmbedder implements Embedder {
  readonly dimensions: number;
  readonly providerId: string;
  readonly modelId: string;
  private readonly model: EmbeddingModel;

  constructor(credentials: ProviderCredentials, providerId: string, modelId: string, dimensions: number) {
    const embeddingProvider = createProvider(credentials);
    this.model = embeddingProvider.embeddingModel(modelId);
    this.dimensions = dimensions;
    this.providerId = providerId;
    this.modelId = modelId;
  }

  async embed(text: string): Promise<EmbedResult> {
    const result = await embed({ model: this.model, value: text });
    return { embedding: result.embedding, tokens: result.usage?.tokens ?? 0 };
  }

  async embedMany(texts: string[]): Promise<EmbedManyResult> {
    const result = await embedMany({ model: this.model, values: texts });
    return { embeddings: result.embeddings, tokens: result.usage?.tokens ?? 0 };
  }
}
