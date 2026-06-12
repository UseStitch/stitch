import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { USAGE_DATE_RANGES } from '@stitch/shared/usage/types';

import { unwrapResult } from '@/lib/route-helpers.js';
import {
  getEmbeddingUsageDashboard,
  getSttUsageDashboard,
  getUsageDashboard,
} from '@/usage/service.js';

const usageQuerySchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  range: z.enum(USAGE_DATE_RANGES).optional(),
  from: z.coerce.number().positive().optional(),
  to: z.coerce.number().positive().optional(),
});

export const usageRouter = new Hono();

usageRouter.get('/', zValidator('query', usageQuerySchema), async (c) => {
  const { providerId, modelId, range, from, to } = c.req.valid('query');

  const result = await getUsageDashboard({ providerId, modelId, range, from, to });
  return unwrapResult(c, result);
});

usageRouter.get('/stt', zValidator('query', usageQuerySchema), async (c) => {
  const { providerId, modelId, range, from, to } = c.req.valid('query');

  const result = await getSttUsageDashboard({ providerId, modelId, range, from, to });
  return unwrapResult(c, result);
});

usageRouter.get('/embedding', zValidator('query', usageQuerySchema), async (c) => {
  const { providerId, modelId, range, from, to } = c.req.valid('query');

  const result = await getEmbeddingUsageDashboard({ providerId, modelId, range, from, to });
  return unwrapResult(c, result);
});
