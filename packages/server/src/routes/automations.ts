import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { CreateAutomationInput, UpdateAutomationInput } from '@stitch/shared/automations/types';

import {
  createAutomation,
  deleteAutomation,
  listAutomationSessions,
  listAutomations,
  runAutomation,
  updateAutomation,
} from '@/automations/service.js';
import { isServiceError } from '@/lib/service-result.js';

const createAutomationSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  initialMessage: z.string().trim().min(1),
});

const updateAutomationSchema = createAutomationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const automationsRouter = new Hono();

automationsRouter.get('/', async (c) => {
  const result = await listAutomations();
  return c.json(result);
});

automationsRouter.post('/', zValidator('json', createAutomationSchema), async (c) => {
  const body = c.req.valid('json') as CreateAutomationInput;
  const result = await createAutomation(body);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 201);
});

automationsRouter.patch('/:id', zValidator('json', updateAutomationSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json') as UpdateAutomationInput;
  const result = await updateAutomation(id, body);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data);
});

automationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteAutomation(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

automationsRouter.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const result = await listAutomationSessions(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data);
});

automationsRouter.post('/:id/run', async (c) => {
  const id = c.req.param('id');
  const result = await runAutomation(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 201);
});
