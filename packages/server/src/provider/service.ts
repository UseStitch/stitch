import { count, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';
import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import {
  isLocalProviderId,
  PROVIDER_IDS,
  type LocalProviderId,
  type ProviderCapability,
  type ProviderId,
} from '@stitch/shared/providers/types';
import type { SttProviderModels } from '@stitch/shared/stt/types';

import { getDb } from '@/db/client.js';
import { localModels, providerConfig } from '@/db/schema/providers.js';
import type { ResolvedEmbeddingModel } from '@/models/embedding/schema.js';
import * as EmbeddingModels from '@/models/embedding/service.js';
import * as LocalModels from '@/models/llm/local.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import * as Models from '@/models/llm/registry.js';
import { getModelCatalog } from '@/models/stt/service.js';
import {
  isEmbeddingProviderCredentials,
  isLlmProviderCredentials,
  ProviderCredentialsSchema,
  type EmbeddingProviderCredentials,
  type LlmProviderCredentials,
  type ModelProviderCredentials,
  type ProviderCredentials,
} from '@/provider/config/schema.js';
import * as ProviderLogos from '@/provider/logos.js';

export {
  isEmbeddingProviderCredentials,
  isLlmProviderCredentials,
  type EmbeddingProviderCredentials,
  type LlmProviderCredentials,
  type ModelProviderCredentials,
  type ProviderCredentials,
};

export type ProviderWithCapabilities = {
  id: string;
  name: string;
  api: string | undefined;
  enabled: boolean;
  capabilities: ProviderCapability[];
};

export type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  model_count: number;
  enabled: boolean;
};

export type ModelSummary = {
  id: string;
  name: string;
  family: string | undefined;
  release_date: string;
  cost: Models.RawModel['cost'];
  limit: Models.RawModel['limit'];
  modalities: Models.RawModel['modalities'];
};

function isValidProviderId(providerId: string): providerId is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(providerId);
}

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

function toEmbeddingModelSummary(model: ResolvedEmbeddingModel): EmbeddingProviderModels['models'][number] {
  return { id: model.id, name: model.name, family: model.family, dimensions: model.dimensions, context: model.context };
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

// ---------------------------------------------------------------------------
// Credentials & Persistence
// ---------------------------------------------------------------------------

export async function isProviderConfigured(providerId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ providerId: providerConfig.providerId })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  return rows.length > 0;
}

export async function listConfiguredProviderIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ providerId: providerConfig.providerId }).from(providerConfig);
  return rows.map((row) => row.providerId);
}

export async function listConfiguredProviderConfigs(): Promise<
  Array<{ providerId: string; credentials: ProviderCredentials }>
> {
  const db = getDb();
  const rows = await db
    .select({ providerId: providerConfig.providerId, credentials: providerConfig.credentials })
    .from(providerConfig);
  return rows;
}

export async function getProviderCredentials(providerId: string): Promise<ProviderCredentials> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const db = getDb();
  const config = (await db.select().from(providerConfig).where(eq(providerConfig.providerId, providerId))).at(0);
  if (!config) {
    throw new HTTPException(404, { message: 'Provider not configured' });
  }

  return config.credentials;
}

export async function upsertProviderCredentials(providerId: string, body: unknown): Promise<void> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const parsed = ProviderCredentialsSchema.safeParse({ ...(body as Record<string, unknown>), providerId });
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid credentials' });
  }

  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: parsed.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: parsed.data, updatedAt: Date.now() },
    });
}

export async function deleteProviderCredentials(providerId: string): Promise<void> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const db = getDb();
  const result = await db
    .delete(providerConfig)
    .where(eq(providerConfig.providerId, providerId))
    .returning({ providerId: providerConfig.providerId });
  if (result.length === 0) {
    throw new HTTPException(404, { message: 'Provider not configured' });
  }

  if (isLocalProviderId(providerId)) {
    await db.delete(localModels).where(eq(localModels.provider, providerId));
  }
}

export async function getStoredBaseURL(provider: LocalProviderId): Promise<string | null> {
  const db = getDb();
  const config = (
    await db
      .select({ credentials: providerConfig.credentials })
      .from(providerConfig)
      .where(eq(providerConfig.providerId, provider))
  ).at(0);
  return (config?.credentials as { baseURL?: string } | undefined)?.baseURL ?? null;
}

// ---------------------------------------------------------------------------
// Provider Inspection & Summaries
// ---------------------------------------------------------------------------

export async function listProvidersWithCapabilities(): Promise<ProviderWithCapabilities[]> {
  const db = getDb();
  const [llmProviders, embeddingProviders, sttCatalog, configs] = await Promise.all([
    Models.get(),
    EmbeddingModels.getEmbeddingModels(),
    getModelCatalog(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);

  const enabledIds = new Set(configs.map((row) => row.providerId));

  const capabilitiesMap = new Map<string, Set<ProviderCapability>>();

  function ensureEntry(id: string): Set<ProviderCapability> {
    const existing = capabilitiesMap.get(id);
    if (existing) return existing;
    const created = new Set<ProviderCapability>();
    capabilitiesMap.set(id, created);
    return created;
  }

  for (const id of Object.keys(llmProviders)) {
    ensureEntry(id).add('llm');
  }

  for (const id of Object.keys(embeddingProviders)) {
    ensureEntry(id).add('embedding');
  }

  for (const entry of sttCatalog) {
    ensureEntry(entry.providerId).add('stt');
  }

  ensureEntry('ollama_local').add('llm');
  ensureEntry('lmstudio_local').add('llm');

  const allIds = new Set([...Object.keys(llmProviders), ...Object.keys(embeddingProviders), ...capabilitiesMap.keys()]);

  const results: ProviderWithCapabilities[] = [];
  for (const id of allIds) {
    const caps = capabilitiesMap.get(id);
    if (!caps || caps.size === 0) continue;

    const meta = PROVIDER_META[id as keyof typeof PROVIDER_META];

    results.push({
      id,
      name: meta.displayName,
      api: meta.api ?? llmProviders[id]?.api,
      enabled: enabledIds.has(id),
      capabilities: [...caps],
    });
  }

  results.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export async function getProvider(providerId: string): Promise<ProviderSummary> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  if (isLocalProviderId(providerId)) {
    const meta = PROVIDER_META[providerId];
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
      name: meta.displayName,
      api: storedBaseURL,
      model_count: modelCount.at(0)?.value ?? 0,
      enabled: config !== undefined,
    };
  }

  if (!isAllowedProvider(providerId)) {
    const meta = PROVIDER_META[providerId];
    return {
      id: providerId,
      name: meta.displayName,
      api: meta.api,
      model_count: 0,
      enabled: await isProviderConfigured(providerId),
    };
  }

  const provider = await resolveProvider(providerId);
  return toProviderSummary(provider, await isProviderConfigured(providerId));
}

export async function getProviderLogo(providerId: string): Promise<string> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const logo = await ProviderLogos.get(providerId);
  if (!logo) {
    throw new HTTPException(404, { message: 'Provider logo not found' });
  }

  return logo;
}

// ---------------------------------------------------------------------------
// Model Resolution & Modality Catalogs
// ---------------------------------------------------------------------------

export async function listProviderModels(providerId: string): Promise<ModelSummary[]> {
  if (!isValidProviderId(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  if (isLocalProviderId(providerId)) {
    const models = await LocalModels.listLocalModels(providerId);
    return models.map(localModelToSummary);
  }

  const provider = await resolveProvider(providerId);
  return Object.values(provider.models).map(toModelSummary);
}

export async function listEnabledSttModels(): Promise<SttProviderModels[]> {
  const db = getDb();
  const [configs, sttCatalog] = await Promise.all([
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
    getModelCatalog(),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));

  const results: SttProviderModels[] = [];
  for (const entry of sttCatalog) {
    if (!enabledIds.has(entry.providerId)) continue;
    const meta = PROVIDER_META[entry.providerId as keyof typeof PROVIDER_META];
    const providerName = meta.displayName;
    results.push({
      providerId: entry.providerId,
      providerName,
      models: entry.models.map((m) => ({
        id: m.modelId,
        name: m.displayName,
        sampleRateHz: m.inputFormat.sampleRateHz,
      })),
    });
  }

  return results;
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
