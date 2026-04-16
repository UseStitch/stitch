import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import { listEnabledProviderEmbeddingModels } from '@/llm/provider/service.js';
import { getMemoryConfig, hasConfiguredEmbeddingModel } from '@/memory/config.js';
import { resetEmbedder } from '@/memory/embedding/factory.js';
import { deleteSetting, listSettings, saveSetting } from '@/settings/service.js';

const settingValueSchema = z.object({ value: z.string() });

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const result = await listSettings();
  return c.json(result);
});

settingsRouter.put('/:key', zValidator('json', settingValueSchema), async (c) => {
  const key = c.req.param('key');
  const { value } = c.req.valid('json');

  if (key === 'memory.enabled' && value === 'true') {
    const memoryConfig = await getMemoryConfig();
    const canEnableMemory = hasConfiguredEmbeddingModel(memoryConfig);
    if (!canEnableMemory) {
      return c.json(
        {
          error:
            'Cannot enable memory without an embedding model. Configure memory.embedding.providerId and memory.embedding.modelId first.',
        },
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
      return c.json(
        {
          error:
            'Cannot enable memory without a configured embedding model from an enabled provider.',
        },
        400,
      );
    }
  }

  const result = await saveSetting(key, value);
  if (isServiceError(result)) return unwrapResult(c, result);

  if (key === 'profile.timezone') {
    try {
      await syncAllAutomationSchedules();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reschedule automations';
      return c.json({ error: message }, 500);
    }
  }

  if (key === 'memory.embedding.providerId' || key === 'memory.embedding.modelId') {
    resetEmbedder();
  }

  return c.body(null, 204);
});

settingsRouter.delete('/:key', async (c) => {
  const key = c.req.param('key');
  const result = await deleteSetting(key);
  if (isServiceError(result)) return unwrapResult(c, result);

  if (key === 'profile.timezone') {
    try {
      await syncAllAutomationSchedules();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reschedule automations';
      return c.json({ error: message }, 500);
    }
  }

  if (key === 'memory.embedding.providerId' || key === 'memory.embedding.modelId') {
    resetEmbedder();
  }

  return c.body(null, 204);
});
