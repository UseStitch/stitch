import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { USAGE_DATE_RANGES, type UsageDateRange } from '@stitch/shared/usage/types';

import { getUsageDashboard } from '@/usage/service.js';
import { unwrapResult } from '@/lib/route-helpers.js';

const usageQuerySchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  range: z.enum(USAGE_DATE_RANGES).optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
});

export const usageRouter = new Hono();

usageRouter.get('/', zValidator('query', usageQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const { providerId, modelId, range, from, to } = query as {
    providerId?: string;
    modelId?: string;
    range?: UsageDateRange;
    from?: number;
    to?: number;
  };

  const result = await getUsageDashboard({
    providerId,
    modelId,
    range,
    from,
    to,
  });

  return unwrapResult(c, result);
});
