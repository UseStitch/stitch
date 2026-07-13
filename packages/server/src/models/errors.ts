class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

export class EmbeddingModelNotConfiguredError extends ModelError {
  constructor() {
    super('Memory embedding model is not configured');
    this.name = 'EmbeddingModelNotConfiguredError';
  }
}

export class EmbeddingProviderUnavailableError extends ModelError {
  readonly providerId: string;
  constructor(providerId: string) {
    super(`Configured embedding provider is unavailable: ${providerId}`);
    this.name = 'EmbeddingProviderUnavailableError';
    this.providerId = providerId;
  }
}

export class ProviderNotEmbeddingCapableError extends ModelError {
  readonly providerId: string;
  constructor(providerId: string) {
    super(`Configured provider is not available for embeddings: ${providerId}`);
    this.name = 'ProviderNotEmbeddingCapableError';
    this.providerId = providerId;
  }
}
