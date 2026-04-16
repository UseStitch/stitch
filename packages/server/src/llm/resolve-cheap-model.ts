import type { SettingsKey } from '@stitch/shared/settings/types';
import { resolveModel, type ResolvedModel } from '@/llm/resolve-model.js';

const CHEAP_MODEL_PRIORITY = [
  'claude-haiku-4-5',
  'claude-haiku-4.5',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gpt-5-nano',
] as const;

/**
 * Resolve a cheap/fast model for auxiliary LLM tasks (title generation,
 * compaction, etc.). Resolution order:
 *
 * 1. Explicit user setting (via `providerIdKey`/`modelIdKey` pair)
 * 2. First available model from `CHEAP_MODEL_PRIORITY` across enabled providers
 * 3. Fallback to the caller-provided model (usually the active chat model)
 *
 * Returns `null` only when no configured provider is found at all.
 * 
 * Note: This acts as a wrapper around `resolveModel`, passing the cheap model
 * priority list, and swallowing errors to return `null` instead for forgiving tasks.
 */
export async function resolveCheapModel(input: {
  providerIdKey: SettingsKey;
  modelIdKey: SettingsKey;
  fallbackProviderId: string;
  fallbackModelId: string;
}): Promise<ResolvedModel | null> {
  const result = await resolveModel({
    providerIdKey: input.providerIdKey,
    modelIdKey: input.modelIdKey,
    fallbackProviderId: input.fallbackProviderId,
    fallbackModelId: input.fallbackModelId,
    priorityModelIds: CHEAP_MODEL_PRIORITY,
  });

  if ('error' in result) {
    return null;
  }

  return result.data;
}
