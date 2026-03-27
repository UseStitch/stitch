import { Hono } from 'hono';

import { USAGE_DATE_RANGES, type UsageDateRange } from '@stitch/shared/usage/types';

import { getUsageDashboard } from '@/usage/service.js';

export const usageRouter = new Hono();

usageRouter.get('/', async (c) => {
  const providerId = c.req.query('providerId') ?? undefined;
  const modelId = c.req.query('modelId') ?? undefined;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const rangeRaw = c.req.query('range');

  const range =
    rangeRaw && (USAGE_DATE_RANGES as readonly string[]).includes(rangeRaw)
      ? (rangeRaw as UsageDateRange)
      : undefined;

  const parsedFrom = from ? Number(from) : undefined;
  const parsedTo = to ? Number(to) : undefined;

  const usage = await getUsageDashboard({
    providerId,
    modelId,
    range,
    from: Number.isFinite(parsedFrom) ? parsedFrom : undefined,
    to: Number.isFinite(parsedTo) ? parsedTo : undefined,
  });

  return c.json(usage);
});
