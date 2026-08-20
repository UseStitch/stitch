import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { PROVIDER_IDS } from '@stitch/shared/providers/types';

import { ICON_CACHE_CONTROL, SVG_CONTENT_TYPE } from '@/lib/icon-cache.js';
import {
  getProvider,
  getProviderLogo,
  listEnabledProviderEmbeddingModels,
  listProviderModels,
} from '@/llm/provider/service.js';
import {
  deleteProviderCredentials,
  getProviderCredentials,
  upsertProviderCredentials,
} from '@/provider/config/service.js';

const providerIdSchema = z.enum(PROVIDER_IDS);
const providerConfigSchema = z.record(z.string(), z.unknown());

export const providerRouter = new Hono();

providerRouter.get('/embedding-models', async (c) => {
  const result = await listEnabledProviderEmbeddingModels();
  return c.json(result);
});

providerRouter.get('/:providerId', zValidator('param', z.object({ providerId: providerIdSchema })), async (c) => {
  const { providerId } = c.req.valid('param');
  const result = await getProvider(providerId);
  return c.json(result);
});

providerRouter.get(
  '/:providerId/models',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await listProviderModels(providerId);
    return c.json(result);
  },
);

providerRouter.get('/:providerId/logo', zValidator('param', z.object({ providerId: providerIdSchema })), async (c) => {
  const { providerId } = c.req.valid('param');
  const logo = await getProviderLogo(providerId);

  c.header('Content-Type', SVG_CONTENT_TYPE);
  c.header('Cache-Control', ICON_CACHE_CONTROL);
  return c.body(logo, 200);
});

providerRouter.get(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await getProviderCredentials(providerId);
    return c.json(result);
  },
);

providerRouter.put(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  zValidator('json', providerConfigSchema),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const body = c.req.valid('json');
    await upsertProviderCredentials(providerId, body);
    return c.body(null, 204);
  },
);

providerRouter.delete(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    await deleteProviderCredentials(providerId);
    return c.body(null, 204);
  },
);
