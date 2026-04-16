import { eq } from 'drizzle-orm';

import { SETTINGS_SCHEMAS } from '@stitch/shared/settings/types';
import type { SettingsKey } from '@stitch/shared/settings/types';

import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { listEnabledProviderEmbeddingModels } from '@/llm/provider/service.js';
import { getMemoryConfig, hasConfiguredEmbeddingModel } from '@/memory/config.js';
import { resetEmbedder } from '@/memory/embedding/factory.js';

export async function listSettings(): Promise<ServiceResult<Record<string, string>>> {
  const db = getDb();
  const rows = await db.select().from(userSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return ok(result);
}

async function checkMemoryEnablePrerequisites(): Promise<ServiceResult<null>> {
  const memoryConfig = await getMemoryConfig();
  if (!hasConfiguredEmbeddingModel(memoryConfig)) {
    return err(
      'Cannot enable memory without an embedding model. Configure memory.embedding.providerId and memory.embedding.modelId first.',
      400,
    );
  }

  const providerModelsResult = await listEnabledProviderEmbeddingModels();
  const providerModels = isServiceError(providerModelsResult) ? [] : providerModelsResult.data;
  const hasConfiguredModel = providerModels.some(
    (provider) =>
      provider.providerId === memoryConfig.embeddingProviderId &&
      provider.models.some((model) => model.id === memoryConfig.embeddingModelId),
  );
  if (!hasConfiguredModel) {
    return err(
      'Cannot enable memory without a configured embedding model from an enabled provider.',
      400,
    );
  }

  return ok(null);
}

function isTimezoneKey(key: string): boolean {
  return key === 'profile.timezone';
}

function isEmbeddingKey(key: string): boolean {
  return key === 'memory.embedding.providerId' || key === 'memory.embedding.modelId';
}

export async function saveSetting(key: string, value: string): Promise<ServiceResult<null>> {
  const schema = SETTINGS_SCHEMAS[key as SettingsKey];
  if (!schema) {
    return err('Invalid setting key', 400);
  }

  const parseResult = schema.safeParse(value);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    return err(`Invalid value: ${issue.message}`, 400);
  }

  if (key === 'memory.enabled' && value === 'true') {
    const prereqResult = await checkMemoryEnablePrerequisites();
    if ('error' in prereqResult) return prereqResult;
  }

  const db = getDb();
  await db
    .insert(userSettings)
    .values({ key: key as SettingsKey, value })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value, updatedAt: Date.now() },
    });

  if (isTimezoneKey(key)) {
    await syncAllAutomationSchedules();
  }

  if (isEmbeddingKey(key)) {
    resetEmbedder();
  }

  return ok(null);
}

export async function deleteSetting(key: string): Promise<ServiceResult<null>> {
  if (!(key in SETTINGS_SCHEMAS)) {
    return err('Invalid setting key', 400);
  }

  const db = getDb();
  const result = await db
    .delete(userSettings)
    .where(eq(userSettings.key, key as SettingsKey))
    .returning({ key: userSettings.key });
  if (result.length === 0) {
    return err('Setting not found', 404);
  }

  if (isTimezoneKey(key)) {
    await syncAllAutomationSchedules();
  }

  if (isEmbeddingKey(key)) {
    resetEmbedder();
  }

  return ok(null);
}
