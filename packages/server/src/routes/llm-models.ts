import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { PROVIDER_IDS } from '@stitch/shared/providers/types';

import { unwrapResult } from '@/lib/route-helpers.js';
import {
  deleteVisibility,
  listVisibilityOverrides,
  upsertVisibility,
} from '@/models/llm/visibility.js';

export const modelsRouter = new Hono();

const visibilityRouter = new Hono();

const providerIdSchema = z.enum(PROVIDER_IDS);
const modelIdSchema = z.string().min(1);

const upsertVisibilitySchema = z.object({
  visibility: z.enum(['show', 'hide']),
});

visibilityRouter.get('/', async (c) => {
  const result = await listVisibilityOverrides();
  return unwrapResult(c, result);
});

visibilityRouter.put(
  '/:providerId/:modelId',
  zValidator('param', z.object({ providerId: providerIdSchema, modelId: modelIdSchema })),
  zValidator('json', upsertVisibilitySchema),
  async (c) => {
    const { providerId, modelId } = c.req.valid('param');
    const { visibility } = c.req.valid('json');

    const result = await upsertVisibility(providerId, modelId, visibility);
    return unwrapResult(c, result, 204);
  },
);

visibilityRouter.delete(
  '/:providerId/:modelId',
  zValidator('param', z.object({ providerId: providerIdSchema, modelId: modelIdSchema })),
  async (c) => {
    const { providerId, modelId } = c.req.valid('param');

    const result = await deleteVisibility(providerId, modelId);
    return unwrapResult(c, result, 204);
  },
);

modelsRouter.route('/visibility', visibilityRouter);
