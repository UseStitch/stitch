import { Hono } from 'hono';

import * as Log from '@/lib/log.js';
import {
  deleteProviderCredentials,
  getProvider,
  getProviderCredentials,
  getProviderLogo,
  getProviderModel,
  listProviderModels,
  listProviders,
  upsertProviderCredentials,
} from '@/provider/service.js';
import { isServiceError } from '@/lib/service-result.js';

const log = Log.create({ service: 'provider-routes' });

export const providerRouter = new Hono();

providerRouter.get('/', async (c) => {
  const providers = await listProviders();
  return c.json(providers);
});

providerRouter.get('/:providerId', async (c) => {
  const providerId = c.req.param('providerId');
  const result = await getProvider(providerId);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'blocked access to provider');
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

providerRouter.get('/:providerId/models', async (c) => {
  const providerId = c.req.param('providerId');
  const result = await listProviderModels(providerId);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'blocked access to provider models');
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

providerRouter.get('/:providerId/models/:modelId', async (c) => {
  const providerId = c.req.param('providerId');
  const modelId = c.req.param('modelId');
  const result = await getProviderModel(providerId, modelId);
  if (isServiceError(result)) {
    log.warn({ providerId, modelId }, 'blocked access to provider model');
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

providerRouter.get('/:providerId/logo', async (c) => {
  const providerId = c.req.param('providerId');
  const result = await getProviderLogo(providerId);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'provider logo request failed');
    return c.json({ error: result.error }, result.status);
  }

  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(result.data, 200);
});

providerRouter.get('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  const result = await getProviderCredentials(providerId);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'provider config request failed');
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

providerRouter.put('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  const body = await c.req.json();
  const result = await upsertProviderCredentials(providerId, body);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'provider config update failed');
    return c.json({ error: result.error, details: result.details }, result.status);
  }

  return c.body(null, 204);
});

providerRouter.delete('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  const result = await deleteProviderCredentials(providerId);
  if (isServiceError(result)) {
    log.warn({ providerId }, 'provider config delete failed');
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});
