import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { PROVIDER_IDS } from '@stitch/shared/providers/types';

import { ICON_CACHE_CONTROL, SVG_CONTENT_TYPE } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import {
  deleteProviderCredentials,
  getProvider,
  getProviderCredentials,
  getProviderLogo,
  listProviderModels,
  upsertProviderCredentials,
} from '@/llm/provider/service.js';

const log = Log.create({ service: 'provider-routes' });

const providerIdSchema = z.enum(PROVIDER_IDS);
const providerConfigSchema = z.record(z.string(), z.unknown());

export const providerRouter = new Hono();

providerRouter.get(
  '/:providerId',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await getProvider(providerId);
    if (isServiceError(result)) log.warn({ providerId }, 'blocked access to provider');
    return unwrapResult(c, result);
  },
);

providerRouter.get(
  '/:providerId/models',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await listProviderModels(providerId);
    if (isServiceError(result)) log.warn({ providerId }, 'blocked access to provider models');
    return unwrapResult(c, result);
  },
);

providerRouter.get(
  '/:providerId/logo',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await getProviderLogo(providerId);
    if (isServiceError(result)) {
      log.warn({ providerId }, 'provider logo request failed');
      return unwrapResult(c, result);
    }

    c.header('Content-Type', SVG_CONTENT_TYPE);
    c.header('Cache-Control', ICON_CACHE_CONTROL);
    return c.body(result.data, 200);
  },
);

providerRouter.get(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await getProviderCredentials(providerId);
    if (isServiceError(result)) log.warn({ providerId }, 'provider config request failed');
    return unwrapResult(c, result);
  },
);

providerRouter.put(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  zValidator('json', providerConfigSchema),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await upsertProviderCredentials(providerId, body);
    if (isServiceError(result)) log.warn({ providerId }, 'provider config update failed');
    return unwrapResult(c, result, 204);
  },
);

providerRouter.delete(
  '/:providerId/config',
  zValidator('param', z.object({ providerId: providerIdSchema })),
  async (c) => {
    const { providerId } = c.req.valid('param');
    const result = await deleteProviderCredentials(providerId);
    if (isServiceError(result)) log.warn({ providerId }, 'provider config delete failed');
    return unwrapResult(c, result, 204);
  },
);
