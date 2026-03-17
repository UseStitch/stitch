import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import * as ProviderLogos from '@/provider/logos.js';
import * as Models from '@/provider/models.js';
import { ProviderCredentialsSchema } from '@/provider/provider.js';

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

function isAllowedProvider(providerId: string): boolean {
  return (Models.ALLOWERD_PROVIDER_IDS as readonly string[]).includes(providerId);
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
  const [providers, configs] = await Promise.all([
    Models.get(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((row) => row.providerId));
  return Object.values(providers).map((provider) => toProviderSummary(provider, enabledIds.has(provider.id)));
}

export async function getProvider(providerId: string): Promise<ServiceResult<ProviderSummary>> {
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

export async function listProviderModels(providerId: string): Promise<ServiceResult<ModelSummary[]>> {
  const providerResult = await resolveProvider(providerId);
  if (isServiceError(providerResult)) {
    return providerResult;
  }

  return ok(Object.values(providerResult.data.models).map(toModelSummary));
}

export async function getProviderModel(
  providerId: string,
  modelId: string,
): Promise<ServiceResult<ModelSummary>> {
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
  const [config] = await db.select().from(providerConfig).where(eq(providerConfig.providerId, providerId));
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

  const parsed = ProviderCredentialsSchema.safeParse({ ...(body as Record<string, unknown>), providerId });
  if (!parsed.success) {
    return err('Invalid credentials', 400, parsed.error.flatten());
  }

  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: parsed.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: parsed.data, updatedAt: new Date() },
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
