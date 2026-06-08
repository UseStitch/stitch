import { PATHS } from '@/lib/paths.js';
import { createRegistryCache } from '@/lib/registry-cache.js';
import {
  EmbeddingRegistryPayloadSchema,
  type EmbeddingModel,
  type EmbeddingProvider,
  type EmbeddingRegistryPayload,
} from '@/llm/provider/embedding-schema.js';
import type { RawModel, RawProvider } from '@/llm/provider/models.js';

const DEFAULT_EMBEDDING_REGISTRY_URL = 'https://usestitch.ai/embedding-models.json';

function toRawModel(model: EmbeddingModel): RawModel {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    attachment: false,
    reasoning: false,
    temperature: false,
    tool_call: false,
    cost: model.cost,
    limit: {
      context: model.context,
      output: model.dimensions,
    },
    modalities: {
      input: model.inputModalities ?? ['text'],
      output: model.outputModalities ?? ['text'],
    },
    options: {},
  };
}

function toRawProvider(provider: EmbeddingProvider): RawProvider {
  const models = Object.fromEntries(provider.models.map((model) => [model.id, toRawModel(model)]));

  return {
    id: provider.providerId,
    name: provider.providerName,
    api: provider.api,
    npm: provider.npm,
    env: provider.env ?? [],
    models,
  };
}

function toRawProviders(providers: EmbeddingProvider[]): Record<string, RawProvider> {
  return Object.fromEntries(
    providers.map((provider) => [provider.providerId, toRawProvider(provider)]),
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
  parse: (raw) => EmbeddingRegistryPayloadSchema.parse(raw),
});

export async function getEmbeddingModelsFromRegistry(
  fetchImpl = fetch,
): Promise<Record<string, RawProvider>> {
  const payload = await embeddingRegistryCache.get(fetchImpl);
  return toRawProviders(payload.providers);
}

export async function refresh(fetchImpl = fetch): Promise<void> {
  await embeddingRegistryCache.refresh(fetchImpl);
}
