import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { USAGE_DATE_RANGES } from '@stitch/shared/usage/types';

import { getUsageDashboard } from '@/usage/service.js';
import { unwrapResult } from '@/lib/route-helpers.js';

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
