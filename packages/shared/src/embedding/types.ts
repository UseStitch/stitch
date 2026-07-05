export type EmbeddingModelSummary = { id: string; name: string; family?: string; dimensions: number; context: number };

export type EmbeddingProviderModels = { providerId: string; providerName: string; models: EmbeddingModelSummary[] };
