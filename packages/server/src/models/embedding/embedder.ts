export type EmbedResult = { embedding: number[]; tokens: number };

export type EmbedManyResult = { embeddings: number[][]; tokens: number };

export interface Embedder {
  embed(text: string): Promise<EmbedResult>;
  embedMany(texts: string[]): Promise<EmbedManyResult>;
  readonly dimensions: number;
  readonly providerId: string;
  readonly modelId: string;
}
