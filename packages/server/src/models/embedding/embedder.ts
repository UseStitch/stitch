/**
 * Abstract interface for generating text embeddings.
 * Implementations use remote API providers.
 */
export interface Embedder {
  /** Generate an embedding vector for a single text. */
  embed(text: string): Promise<number[]>;
  /** Generate embedding vectors for multiple texts in a batch. */
  embedMany(texts: string[]): Promise<number[][]>;
  /** The dimensionality of the embedding vectors produced. */
  readonly dimensions: number;
}
