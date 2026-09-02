import { HTTPException } from 'hono/http-exception';

import type { LlmProviderId } from '@stitch/shared/providers/types';
import type { SettingsKey } from '@stitch/shared/settings/types';

import { isAllowedProvider } from '@/models/llm/registry.js';
import * as Models from '@/models/llm/registry.js';
import {
  isLlmProviderCredentials,
  isProviderConfigured,
  listConfiguredProviderConfigs,
  type LlmProviderCredentials,
} from '@/provider/service.js';
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
};

/**
 * Resolves a model configuration by:
 * 1. Reading user settings for preferred provider/model
 * 2. If settings are empty, searching for `priorityModelIds` across all enabled providers
 * 3. Falling back to provided defaults if nothing else matches
 * 4. Validating the provider is allowed and the model exists
 * 5. Looking up provider credentials from the database
 *
 * Returns the resolved provider, model, and credentials.
 */
export async function resolveModel(input: ResolveModelInput): Promise<ResolvedModel> {
  const [settingsMap, configs, providers] = await Promise.all([
    getSettings([input.providerIdKey, input.modelIdKey] as const),
    listConfiguredProviderConfigs(),
    Models.get(),
  ]);

  const configuredProviderId = (settingsMap[input.providerIdKey] as string).trim();
  const configuredModelId = (settingsMap[input.modelIdKey] as string).trim();

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
        const provider = providers[providerId] as Models.RawProvider | undefined;
        if (provider?.models[modelId]) {
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
    throw new HTTPException(400, { message: 'No model configured and no fallback available' });
  }

  if (!isAllowedProvider(targetProviderId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const provider = providers[targetProviderId] as Models.RawProvider | undefined;
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  const model = provider.models[targetModelId] as Models.RawModel | undefined;
  if (!model) throw new HTTPException(400, { message: 'Model not found for provider' });

  const config = configs.find((c) => c.providerId === targetProviderId);
  if (!config) throw new HTTPException(400, { message: 'Provider is not configured' });

  if (config.credentials.providerId !== targetProviderId || !isLlmProviderCredentials(config.credentials)) {
    throw new HTTPException(400, { message: 'Provider credentials do not match the resolved LLM provider' });
  }

  return { providerId: targetProviderId, modelId: targetModelId, credentials: config.credentials };
}

/**
 * Validates that a provider + model combination is configured and available.
 * Does not return credentials — use when you only need to gate on validity.
 */
export async function validateProviderModel(providerId: string, modelId: string): Promise<void> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const [providers, configured] = await Promise.all([Models.get(), isProviderConfigured(providerId)]);

  const provider = providers[providerId] as Models.RawProvider | undefined;
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  const model = provider.models[modelId] as Models.RawModel | undefined;
  if (!model) throw new HTTPException(400, { message: 'Model not found for provider' });

  if (!configured) throw new HTTPException(400, { message: 'Provider is not configured' });
}
