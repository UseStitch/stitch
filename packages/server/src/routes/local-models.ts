import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { isLocalProviderId, type LocalProviderId } from '@stitch/shared/providers/types';

import {
  LocalModelInputSchema,
  checkHealth as checkProviderHealth,
  deleteLocalModel,
  discoverModels,
  getLocalModel,
  listLocalModels,
  upsertLocalModel,
} from '@/models/llm/local.js';
import { getStoredBaseURL } from '@/provider/service.js';

export const localModelsRouter = new Hono<{ Variables: { provider: LocalProviderId } }>();

localModelsRouter.use('*', async (c, next) => {
  const provider = c.req.param('provider');
  if (!provider || !isLocalProviderId(provider)) {
    return c.json({ error: 'Invalid provider' }, 400);
  }
  c.set('provider', provider);
  await next();
});

localModelsRouter.get('/', async (c) => {
  const provider = c.get('provider');
  const models = await listLocalModels(provider);
  return c.json(models);
});

localModelsRouter.get('/discover', async (c) => {
  const provider = c.get('provider');
  const baseURL = await getStoredBaseURL(provider);
  if (!baseURL) {
    return c.json({ error: 'Provider not configured — set a Base URL first' }, 400);
  }
  const result = await discoverModels(provider, baseURL);
  return c.json(result);
});

localModelsRouter.get('/health', async (c) => {
  const provider = c.get('provider');
  const baseURL = await getStoredBaseURL(provider);
  if (!baseURL) {
    return c.json({ reachable: false });
  }
  const reachable = await checkProviderHealth(provider, baseURL);
  return c.json({ reachable });
});

localModelsRouter.get('/:id', async (c) => {
  const provider = c.get('provider');
  const id = c.req.param('id');
  const result = await getLocalModel(provider, id);
  return c.json(result);
});

localModelsRouter.post('/', zValidator('json', LocalModelInputSchema), async (c) => {
  const provider = c.get('provider');
  const input = c.req.valid('json');
  const result = await upsertLocalModel(provider, input);
  return c.json(result, 201);
});

localModelsRouter.put('/:id', zValidator('json', LocalModelInputSchema), async (c) => {
  const provider = c.get('provider');
  const id = c.req.param('id');
  const input = { ...c.req.valid('json'), id };
  const result = await upsertLocalModel(provider, input);
  return c.json(result);
});

localModelsRouter.delete('/:id', async (c) => {
  const provider = c.get('provider');
  const id = c.req.param('id');
  await deleteLocalModel(provider, id);
  return c.body(null, 204);
});
