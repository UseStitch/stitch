import { eq, count } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig, ollamaModels } from '@/db/schema.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import * as ProviderLogos from '@/llm/provider/logos.js';
import { isAllowedProvider } from '@/llm/provider/models.js';
import * as Models from '@/llm/provider/models.js';
import * as OllamaModels from '@/llm/provider/ollama-models.js';
import { ProviderCredentialsSchema } from '@/llm/provider/provider.js';

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

type ProviderModelsSummary = {
  providerId: string;
  providerName: string;
  models: ModelSummary[];
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

export async function listProviders(): Promise<ProviderSummary[]> {
  const db = getDb();
  const [providers, configs, ollamaModelCount] = await Promise.all([
    Models.get(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
    db.select({ value: count() }).from(ollamaModels),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));
  const ollamaCount = ollamaModelCount[0]?.value ?? 0;

  const summaries = Object.values(providers).map((provider) =>
    toProviderSummary(provider, enabledIds.has(provider.id)),
  );

  summaries.push({
    id: 'ollama_local',
    name: 'Ollama',
    api: 'http://localhost:11434',
    model_count: ollamaCount,
    enabled: enabledIds.has('ollama_local'),
  });

  return summaries;
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

  const providerResult = await resolveProvider(providerId);
  if (isServiceError(providerResult)) {
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
      input: m.supportsVision ? (['text', 'image'] as const) : (['text'] as const),
      output: ['text'] as const,
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
  if (isServiceError(providerResult)) {
    return providerResult;
  }

  return ok(Object.values(providerResult.data.models).map(toModelSummary));
}

export async function listEnabledProviderAudioModels(): Promise<ProviderModelsSummary[]> {
  const db = getDb();
  const [providers, configs] = await Promise.all([
    Models.getAudioModels(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  return Object.values(providers)
    .filter((provider) => enabledIds.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: Object.values(provider.models).map(toModelSummary),
    }));
}

export async function listEnabledProviderEmbeddingModels(): Promise<ProviderModelsSummary[]> {
  const db = getDb();
  const [providers, configs] = await Promise.all([
    Models.getEmbeddingModels(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  return Object.values(providers)
    .filter((provider) => enabledIds.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: Object.values(provider.models).map(toModelSummary),
    }));
}

export async function getEmbeddingModelDimensions(
  providerId: string,
  modelId: string,
): Promise<number | undefined> {
  const providers = await Models.getEmbeddingModels();
  const model = providers[providerId]?.models[modelId];
  if (!model) return undefined;
  return Models.getEmbeddingDimensions(model);
}

export async function getProviderModel(
  providerId: string,
  modelId: string,
): Promise<ServiceResult<ModelSummary>> {
  if (providerId === 'ollama_local') {
    const result = await OllamaModels.getOllamaModel(modelId);
    if (isServiceError(result)) return result;
    return ok(ollamaModelToSummary(result.data));
  }

  const providerResult = await resolveProvider(providerId);
  if (isServiceError(providerResult)) {
    return providerResult;
  }

  const model = providerResult.data.models[modelId];
  if (!model) {
    return err('Model not found', 404);
  }

  return ok(toModelSummary(model));
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

export async function getProviderCredentials(providerId: string): Promise<ServiceResult<unknown>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  if (!config) {
    return err('Provider not configured', 404);
  }

  return ok(config.credentials);
}

export async function upsertProviderCredentials(
  providerId: string,
  body: unknown,
): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const parsed = ProviderCredentialsSchema.safeParse({
    ...(body as Record<string, unknown>),
    providerId,
  });
  if (!parsed.success) {
    return err('Invalid credentials', 400, parsed.error.flatten());
  }

  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: parsed.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: parsed.data, updatedAt: Date.now() },
    });

  return ok(null);
}

export async function deleteProviderCredentials(providerId: string): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const db = getDb();
  const result = await db
    .delete(providerConfig)
    .where(eq(providerConfig.providerId, providerId))
    .returning({ providerId: providerConfig.providerId });
  if (result.length === 0) {
    return err('Provider not configured', 404);
  }

  return ok(null);
}
