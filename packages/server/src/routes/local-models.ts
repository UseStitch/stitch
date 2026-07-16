import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { isLocalProviderId } from '@stitch/shared/providers/types';

import type { LocalProviderId } from '@/db/schema/providers.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import {
  LocalModelInputSchema,
  checkHealth as checkProviderHealth,
  deleteLocalModel,
  discoverModels,
  getLocalModel,
  getStoredBaseURL,
  listLocalModels,
  upsertLocalModel,
} from '@/models/llm/local.js';

export const localModelsRouter = new Hono();

localModelsRouter.use('*', async (c, next) => {
  const provider = c.req.param('provider');
  if (!provider || !isLocalProviderId(provider)) {
    return c.json({ error: 'Invalid provider' }, 400);
  }
  c.set('provider' as never, provider as never);
  await next();
});

localModelsRouter.get('/', async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const models = await listLocalModels(provider);
  return c.json(models);
});

localModelsRouter.get('/discover', async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const baseURL = await getStoredBaseURL(provider);
  if (!baseURL) {
    return c.json({ error: 'Provider not configured — set a Base URL first' }, 400);
  }
  const result = await discoverModels(provider, baseURL);
  return unwrapResult(c, result);
});

localModelsRouter.get('/health', async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const baseURL = await getStoredBaseURL(provider);
  if (!baseURL) {
    return c.json({ reachable: false });
  }
  const reachable = await checkProviderHealth(provider, baseURL);
  return c.json({ reachable });
});

localModelsRouter.get('/:id', async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const id = c.req.param('id');
  const result = await getLocalModel(provider, id);
  return unwrapResult(c, result);
});

localModelsRouter.post('/', zValidator('json', LocalModelInputSchema), async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const input = c.req.valid('json');
  const result = await upsertLocalModel(provider, input);
  return unwrapResult(c, result, 201);
});

localModelsRouter.put('/:id', zValidator('json', LocalModelInputSchema), async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const id = c.req.param('id');
  const input = { ...c.req.valid('json'), id };
  const result = await upsertLocalModel(provider, input);
  return unwrapResult(c, result);
});

localModelsRouter.delete('/:id', async (c) => {
  const provider = c.get('provider' as never) as LocalProviderId;
  const id = c.req.param('id');
  const result = await deleteLocalModel(provider, id);
  return unwrapResult(c, result, 204);
});
