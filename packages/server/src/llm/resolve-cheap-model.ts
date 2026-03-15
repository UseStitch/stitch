import { eq } from 'drizzle-orm';

import { SettingsKey } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { userSettings, providerConfig } from '@/db/schema.js';
import * as Models from '@/provider/models.js';
import type { ProviderCredentials } from '@/provider/provider.js';

const SEPARATOR = ':::';

const CHEAP_MODEL_PRIORITY = [
  'claude-haiku-4-5',
  'claude-haiku-4.5',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gpt-5-nano',
] as const;

type ResolvedModel = {
  providerId: string;
  modelId: string;
  credentials: ProviderCredentials;
};

/**
 * Resolve a cheap/fast model for auxiliary LLM tasks (title generation,
 * compaction, etc.). Resolution order:
 *
 * 1. Explicit user setting (via `settingsKey`, e.g. `model.title`)
 * 2. First available model from `CHEAP_MODEL_PRIORITY` across enabled providers
 * 3. Fallback to the caller-provided model (usually the active chat model)
 *
 * Returns `null` only when no configured provider is found at all.
 */
export async function resolveCheapModel(input: {
  settingsKey: SettingsKey;
  fallbackProviderId: string;
  fallbackModelId: string;
}): Promise<ResolvedModel | null> {
  const db = getDb();

  const [settingRows, enabledConfigs] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.key, input.settingsKey)),
    db.select().from(providerConfig),
  ]);

  // 1. Check explicit setting
  if (settingRows.length > 0 && settingRows[0].value) {
    const parts = settingRows[0].value.split(SEPARATOR);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const config = enabledConfigs.find((c) => c.providerId === parts[0]);
      if (config) {
        return { providerId: parts[0], modelId: parts[1], credentials: config.credentials };
      }
    }
  }

  // 2. Try cheap models from priority list
  const modelsData = await Models.get();
  const enabledProviderIds = new Set(enabledConfigs.map((c) => c.providerId));

  for (const modelId of CHEAP_MODEL_PRIORITY) {
    for (const providerId of enabledProviderIds) {
      const provider = modelsData[providerId];
      if (provider?.models[modelId]) {
        const config = enabledConfigs.find((c) => c.providerId === providerId);
        if (config) {
          return { providerId, modelId, credentials: config.credentials };
        }
      }
    }
  }

  // 3. Fall back to the caller-provided model
  const fallbackConfig = enabledConfigs.find((c) => c.providerId === input.fallbackProviderId);
  if (fallbackConfig) {
    return {
      providerId: input.fallbackProviderId,
      modelId: input.fallbackModelId,
      credentials: fallbackConfig.credentials,
    };
  }

  return null;
}
