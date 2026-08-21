import { eq, count } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';
import { isLocalProviderId, type LocalProviderId } from '@stitch/shared/providers/types';

import { getDb } from '@/db/client.js';
import { providerConfig, localModels } from '@/db/schema/providers.js';
import type { ResolvedEmbeddingModel } from '@/models/embedding/schema.js';
import * as EmbeddingModels from '@/models/embedding/service.js';
import * as LocalModels from '@/models/llm/local.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import * as Models from '@/models/llm/registry.js';
import * as ProviderLogos from '@/provider/logos.js';

type ProviderSummary = { id: string; name: string; api: string | undefined; model_count: number; enabled: boolean };

type ModelSummary = {
  id: string;
  name: string;
  family: string | undefined;
  release_date: string;
  cost: Models.RawModel['cost'];
  limit: Models.RawModel['limit'];
  modalities: Models.RawModel['modalities'];
};

function toProviderSummary(provider: Models.RawProvider, enabled: boolean): ProviderSummary {
  return {
    id: provider.id,
    name: provider.name,
    api: provider.api,
    model_count: Object.keys(provider.models).length,
    enabled,
  };
}

function toModelSummary(model: Models.RawModel): ModelSummary {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    cost: model.cost,
    limit: model.limit,
    modalities: model.modalities,
  };
}

async function resolveProvider(providerId: string): Promise<Models.RawProvider> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const providers = await Models.get();
  const provider = providers[providerId] as Models.RawProvider | undefined;
  if (!provider) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  return provider;
}

const LOCAL_PROVIDER_META: Record<LocalProviderId, { name: string }> = {
  ollama_local: { name: 'Ollama' },
  lmstudio_local: { name: 'LM Studio' },
};

async function isProviderEnabled(providerId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ providerId: providerConfig.providerId })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  return rows.length > 0;
}

export async function getProvider(providerId: string): Promise<ProviderSummary> {
  if (isLocalProviderId(providerId)) {
    const meta = LOCAL_PROVIDER_META[providerId];
    const db = getDb();
    const [configRows, modelCount] = await Promise.all([
      db
        .select({ providerId: providerConfig.providerId, credentials: providerConfig.credentials })
        .from(providerConfig)
        .where(eq(providerConfig.providerId, providerId)),
      db.select({ value: count() }).from(localModels).where(eq(localModels.provider, providerId)),
    ]);
    const config = configRows.at(0);
    const storedBaseURL = (config?.credentials as { baseURL?: string } | undefined)?.baseURL;
    return {
      id: providerId,
      name: meta.name,
      api: storedBaseURL,
      model_count: modelCount.at(0)?.value ?? 0,
      enabled: config !== undefined,
    };
  }

  if (providerId === 'elevenlabs') {
    return {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      api: 'https://api.elevenlabs.io',
      model_count: 0,
      enabled: await isProviderEnabled('elevenlabs'),
    };
  }

  const provider = await resolveProvider(providerId);
  return toProviderSummary(provider, await isProviderEnabled(providerId));
}

function localModelToSummary(m: LocalModels.LocalModel): ModelSummary {
  return {
    id: m.id,
    name: m.name,
    family: undefined,
    release_date: new Date(m.createdAt).toISOString().split('T')[0],
    cost: {
      input: m.inputCostPerMillion,
      output: m.outputCostPerMillion,
      ...(m.cacheReadCostPerMillion !== null && { cache_read: m.cacheReadCostPerMillion }),
      ...(m.cacheWriteCostPerMillion !== null && { cache_write: m.cacheWriteCostPerMillion }),
    },
    limit: { context: m.contextWindow, ...(m.inputLimit !== null && { input: m.inputLimit }), output: m.outputLimit },
    modalities: { input: m.inputModalities, output: m.outputModalities },
  };
}

export async function listProviderModels(providerId: string): Promise<ModelSummary[]> {
  if (isLocalProviderId(providerId)) {
    const models = await LocalModels.listLocalModels(providerId);
    return models.map(localModelToSummary);
  }

  const provider = await resolveProvider(providerId);
  return Object.values(provider.models).map(toModelSummary);
}

function toEmbeddingModelSummary(model: ResolvedEmbeddingModel): EmbeddingProviderModels['models'][number] {
  return { id: model.id, name: model.name, family: model.family, dimensions: model.dimensions, context: model.context };
}

export async function listEnabledProviderEmbeddingModels(): Promise<EmbeddingProviderModels[]> {
  const db = getDb();
  const [providers, configs] = await Promise.all([
    EmbeddingModels.getEmbeddingModels(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  return Object.values(providers)
    .filter((provider) => enabledIds.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: Object.values(provider.models).map(toEmbeddingModelSummary),
    }));
}

/** @knipignore Reserved for embedding consumers. */
export async function getEmbeddingModelDimensions(providerId: string, modelId: string): Promise<number | undefined> {
  const providers = await EmbeddingModels.getEmbeddingModels();
  const model = providers[providerId]?.models[modelId] as ResolvedEmbeddingModel | undefined;
  if (!model) return undefined;
  return EmbeddingModels.getEmbeddingDimensions(model);
}

export async function getProviderLogo(providerId: string): Promise<string> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const logo = await ProviderLogos.get(providerId);
  if (!logo) {
    throw new HTTPException(404, { message: 'Provider logo not found' });
  }

  return logo;
}
