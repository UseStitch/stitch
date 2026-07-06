import { eq } from 'drizzle-orm';

import type { LlmProviderId } from '@stitch/shared/providers/types';
import type { SettingsKey } from '@stitch/shared/settings/types';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { err, ok, type ServiceResult } from '@/lib/service-result.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import * as Models from '@/models/llm/registry.js';
import { isLlmProviderCredentials, type LlmProviderCredentials } from '@/provider/config/schema.js';
import { getSettings } from '@/settings/service.js';

export type ResolvedModel = { providerId: LlmProviderId; modelId: string; credentials: LlmProviderCredentials };

type ResolveModelInput = {
  /** Settings keys to check for user-configured preference */
  providerIdKey: SettingsKey;
  modelIdKey: SettingsKey;
  /** Fallback when settings are missing or invalid */
  fallbackProviderId?: string;
  fallbackModelId?: string;
  /**
   * Ordered list of model IDs to search for across all enabled providers if settings are missing.
   * Useful for dynamic discovery of "cheap" or task-specific models.
   */
  priorityModelIds?: readonly string[] | string[];
  /**
   * Optional filter to restrict which models are acceptable.
   * E.g., filter for audio-capable models only.
   */
  modelFilter?: (model: Models.RawModel) => boolean;
};

/**
 * Resolves a model configuration by:
 * 1. Reading user settings for preferred provider/model
 * 2. If settings are empty, searching for `priorityModelIds` across all enabled providers
 * 3. Falling back to provided defaults if nothing else matches
 * 4. Validating the provider is allowed and the model exists
 * 5. Optionally filtering by model capabilities
 * 6. Looking up provider credentials from the database
 *
 * Returns a ServiceResult with the resolved provider, model, and credentials.
 */
export async function resolveModel(input: ResolveModelInput): Promise<ServiceResult<ResolvedModel>> {
  const db = getDb();

  const [settingsMap, configs, providers] = await Promise.all([
    getSettings([input.providerIdKey, input.modelIdKey] as const),
    db.select().from(providerConfig),
    Models.get(),
  ]);

  const configuredProviderId = (settingsMap[input.providerIdKey] as string)?.trim();
  const configuredModelId = (settingsMap[input.modelIdKey] as string)?.trim();

  let targetProviderId: string | undefined;
  let targetModelId: string | undefined;

  // 1. Explicit user settings
  if (configuredProviderId && configuredModelId) {
    targetProviderId = configuredProviderId;
    targetModelId = configuredModelId;
  }
  // 2. Priority models search across enabled providers
  else if (input.priorityModelIds && input.priorityModelIds.length > 0) {
    const enabledProviderIds = new Set(configs.map((c) => c.providerId));
    for (const modelId of input.priorityModelIds) {
      for (const providerId of enabledProviderIds) {
        if (providers[providerId]?.models[modelId]) {
          targetProviderId = providerId;
          targetModelId = modelId;
          break;
        }
      }
      if (targetProviderId) break;
    }
  }

  // 3. Fallbacks
  if (!targetProviderId || !targetModelId) {
    targetProviderId = input.fallbackProviderId;
    targetModelId = input.fallbackModelId;
  }

  if (!targetProviderId || !targetModelId) {
    return err('No model configured and no fallback available', 400);
  }

  if (!isAllowedProvider(targetProviderId)) {
    return err('Provider not found', 404);
  }

  const provider = providers[targetProviderId];
  if (!provider) return err('Provider not found', 404);

  const model = provider.models[targetModelId];
  if (!model) return err('Model not found for provider', 400);

  if (input.modelFilter && !input.modelFilter(model)) {
    return err('Model does not meet required capabilities', 400);
  }

  const config = configs.find((c) => c.providerId === targetProviderId);
  if (!config) return err('Provider is not configured', 400);

  if (config.credentials.providerId !== targetProviderId || !isLlmProviderCredentials(config.credentials)) {
    return err('Provider credentials do not match the resolved LLM provider', 400);
  }

  return ok({ providerId: targetProviderId, modelId: targetModelId, credentials: config.credentials });
}

/**
 * Validates that a provider + model combination is configured and available.
 * Does not return credentials — use when you only need to gate on validity.
 */
export async function validateProviderModel(providerId: string, modelId: string): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const db = getDb();
  const [providers, config] = await Promise.all([
    Models.get(),
    db
      .select({ providerId: providerConfig.providerId })
      .from(providerConfig)
      .where(eq(providerConfig.providerId, providerId))
      .get(),
  ]);

  const provider = providers[providerId];
  if (!provider) return err('Provider not found', 404);

  const model = provider.models[modelId];
  if (!model) return err('Model not found for provider', 400);

  if (!config) return err('Provider is not configured', 400);

  return ok(null);
}
