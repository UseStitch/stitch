import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { isServiceError } from '@/lib/service-result.js';
import { deleteVisibility, listVisibilityOverrides, upsertVisibility } from '@/models/service.js';

export const modelsRouter = new Hono();

const visibilityRouter = new Hono();

const upsertVisibilitySchema = z.object({
  visibility: z.enum(['show', 'hide']),
});

visibilityRouter.get('/', async (c) => {
  const overrides = await listVisibilityOverrides();
  return c.json(overrides);
});

visibilityRouter.put(
  '/:providerId/:modelId',
  zValidator('json', upsertVisibilitySchema),
  async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    const { visibility } = c.req.valid('json');

    const result = await upsertVisibility(providerId, modelId, visibility);
    if (isServiceError(result)) {
      return c.json({ error: result.error }, result.status);
    }
    return c.body(null, 204);
  },
);

visibilityRouter.delete('/:providerId/:modelId', async (c) => {
  const providerId = c.req.param('providerId');
  const modelId = c.req.param('modelId');

  const result = await deleteVisibility(providerId, modelId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});

modelsRouter.route('/visibility', visibilityRouter);
