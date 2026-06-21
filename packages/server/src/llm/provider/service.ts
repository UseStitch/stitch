import { eq, count } from 'drizzle-orm';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';

import { getDb } from '@/db/client.js';
import { providerConfig, ollamaModels } from '@/db/schema/providers.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import type { ResolvedEmbeddingModel } from '@/models/embedding/schema.js';
import * as EmbeddingModels from '@/models/embedding/service.js';
import * as OllamaModels from '@/models/llm/ollama.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import * as Models from '@/models/llm/registry.js';
import * as ProviderLogos from '@/provider/logos.js';

type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  model_count: number;
  enabled: boolean;
};

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

async function resolveProvider(providerId: string): Promise<ServiceResult<Models.RawProvider>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const providers = await Models.get();
  const provider = providers[providerId];
  if (!provider) {
    return err('Provider not found', 404);
  }

  return ok(provider);
}

export async function getProvider(providerId: string): Promise<ServiceResult<ProviderSummary>> {
  if (providerId === 'ollama_local') {
    const db = getDb();
    const [[config], modelCount] = await Promise.all([
      db
        .select({ providerId: providerConfig.providerId })
        .from(providerConfig)
        .where(eq(providerConfig.providerId, 'ollama_local')),
      db.select({ value: count() }).from(ollamaModels),
    ]);
    return ok({
      id: 'ollama_local',
      name: 'Ollama',
      api: 'http://localhost:11434',
      model_count: modelCount[0]?.value ?? 0,
      enabled: config !== undefined,
    });
  }

  if (providerId === 'elevenlabs') {
    const db = getDb();
    const [config] = await db
      .select({ providerId: providerConfig.providerId })
      .from(providerConfig)
      .where(eq(providerConfig.providerId, 'elevenlabs'));
    return ok({
      id: 'elevenlabs',
      name: 'ElevenLabs',
      api: 'https://api.elevenlabs.io',
      model_count: 0,
      enabled: config !== undefined,
    });
  }

  const providerResult = await resolveProvider(providerId);
  if (providerResult.error) {
    return providerResult;
  }

  const db = getDb();
  const [config] = await db
    .select({ providerId: providerConfig.providerId })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));

  return ok(toProviderSummary(providerResult.data, config !== undefined));
}

function ollamaModelToSummary(m: OllamaModels.OllamaModel): ModelSummary {
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
    limit: {
      context: m.contextWindow,
      ...(m.inputLimit !== null && { input: m.inputLimit }),
      output: m.outputLimit,
    },
    modalities: {
      input: m.inputModalities,
      output: m.outputModalities,
    },
  };
}

export async function listProviderModels(
  providerId: string,
): Promise<ServiceResult<ModelSummary[]>> {
  if (providerId === 'ollama_local') {
    const models = await OllamaModels.listOllamaModels();
    return ok(models.map(ollamaModelToSummary));
  }

  const providerResult = await resolveProvider(providerId);
  if (providerResult.error) {
    return providerResult;
  }

  return ok(Object.values(providerResult.data.models).map(toModelSummary));
}

function toEmbeddingModelSummary(
  model: ResolvedEmbeddingModel,
): EmbeddingProviderModels['models'][number] {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    dimensions: model.dimensions,
    context: model.context,
  };
}

export async function listEnabledProviderEmbeddingModels(): Promise<
  ServiceResult<EmbeddingProviderModels[]>
> {
  const db = getDb();
  const [providers, configs] = await Promise.all([
    EmbeddingModels.getEmbeddingModels(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  return ok(
    Object.values(providers)
      .filter((provider) => enabledIds.has(provider.id))
      .map((provider) => ({
        providerId: provider.id,
        providerName: provider.name,
        models: Object.values(provider.models).map(toEmbeddingModelSummary),
      })),
  );
}

export async function getEmbeddingModelDimensions(
  providerId: string,
  modelId: string,
): Promise<number | undefined> {
  const providers = await EmbeddingModels.getEmbeddingModels();
  const model = providers[providerId]?.models[modelId];
  if (!model) return undefined;
  return EmbeddingModels.getEmbeddingDimensions(model);
}

export async function getProviderLogo(providerId: string): Promise<ServiceResult<string>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const logo = await ProviderLogos.get(providerId);
  if (!logo) {
    return err('Provider logo not found', 404);
  }

  return ok(logo);
}
