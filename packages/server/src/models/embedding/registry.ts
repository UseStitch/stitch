import { PATHS } from '@/lib/paths.js';
import { createRegistryCache } from '@/lib/registry-cache.js';
import {
  EmbeddingRegistryPayloadSchema,
  type EmbeddingModel,
  type EmbeddingProvider,
  type EmbeddingRegistryPayload,
  type ResolvedEmbeddingModel,
  type ResolvedEmbeddingProvider,
} from '@/models/embedding/schema.js';

const DEFAULT_EMBEDDING_REGISTRY_URL = 'https://usestitch.ai/embedding-models.json';

function toResolvedModel(model: EmbeddingModel): ResolvedEmbeddingModel {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    dimensions: model.dimensions,
    context: model.context,
    cost: model.cost,
    modalities: {
      input: model.inputModalities ?? ['text'],
      output: model.outputModalities ?? ['text'],
    },
  };
}

function toResolvedProvider(provider: EmbeddingProvider): ResolvedEmbeddingProvider {
  const models = Object.fromEntries(
    provider.models.map((model) => [model.id, toResolvedModel(model)]),
  );

  return {
    id: provider.providerId,
    name: provider.providerName,
    api: provider.api,
    models,
  };
}

function toResolvedProviders(
  providers: EmbeddingProvider[],
): Record<string, ResolvedEmbeddingProvider> {
  return Object.fromEntries(
    providers.map((provider) => [provider.providerId, toResolvedProvider(provider)]),
  );
}

function getRegistryUrl(): string {
  return process.env['STITCH_EMBEDDING_REGISTRY_URL']?.trim() || DEFAULT_EMBEDDING_REGISTRY_URL;
}

const embeddingRegistryCache = createRegistryCache<EmbeddingRegistryPayload>({
  cacheFilePath: PATHS.filePaths.embeddingModelsRegistry,
  get url() {
    return getRegistryUrl();
  },
  parse: (raw) => {
    const payload = EmbeddingRegistryPayloadSchema.parse(raw);
    return {
      ...payload,
      providers: payload.providers.map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => !model.deprecated),
      })),
    };
  },
});

export async function getEmbeddingModelsFromRegistry(
  fetchImpl = fetch,
): Promise<Record<string, ResolvedEmbeddingProvider>> {
  const payload = await embeddingRegistryCache.get(fetchImpl);
  return toResolvedProviders(payload.providers);
}

export async function refresh(fetchImpl = fetch): Promise<void> {
  await embeddingRegistryCache.refresh(fetchImpl);
}
