/**
 * Abstract interface for generating text embeddings.
 * Implementations can use local models or remote API providers.
 */
export interface MemoryEmbedder {
  /** Generate an embedding vector for a single text. */
  embed(text: string): Promise<number[]>;
  /** Generate embedding vectors for multiple texts in a batch. */
  embedMany(texts: string[]): Promise<number[][]>;
  /** The dimensionality of the embedding vectors produced. */
  readonly dimensions: number;
}
