import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type {
  CreateAutomationInput,
  DeleteAutomationInput,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';

import { syncAutomationSchedule, unregisterAutomationSchedule } from '@/automations/scheduler.js';
import {
  createAutomationAndSync,
  deleteAutomation,
  getAutomation,
  listAutomationSessions,
  listAutomations,
  runAutomation,
  updateAutomationAndSync,
} from '@/automations/service.js';
import * as Log from '@/lib/log.js';
import { paginationQuerySchema, routeSchemas } from '@/lib/route-schemas.js';

const log = Log.create({ service: 'automations' });

const scheduleSchema = z.object({ type: z.literal('cron'), expression: z.string().trim().min(1) }).nullable();

const createAutomationSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  initialMessage: z.string().trim().min(1),
  schedule: scheduleSchema.optional().default(null),
});

const updateAutomationSchema = createAutomationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

const deleteAutomationSchema = z.object({ archiveSessions: z.boolean().optional().default(false) });

const automationIdParamSchema = z.object({ id: routeSchemas.automationId });

export const automationsRouter = new Hono();

automationsRouter.get('/', zValidator('query', paginationQuerySchema({ pageSize: 10 })), async (c) => {
  const { page, pageSize } = c.req.valid('query');
  const result = await listAutomations({ page, pageSize });
  return c.json(result);
});

automationsRouter.post('/', zValidator('json', createAutomationSchema), async (c) => {
  const body = c.req.valid('json') as CreateAutomationInput;
  const result = await createAutomationAndSync(body, syncAutomationSchedule);
  return c.json(result, 201);
});

automationsRouter.patch(
  '/:id',
  zValidator('param', automationIdParamSchema),
  zValidator('json', updateAutomationSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json') as UpdateAutomationInput;
    const result = await updateAutomationAndSync(id, body, syncAutomationSchedule);
    return c.json(result);
  },
);

automationsRouter.delete(
  '/:id',
  zValidator('param', automationIdParamSchema),
  zValidator('json', deleteAutomationSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json') as DeleteAutomationInput;
    await deleteAutomation(id, body);

    await unregisterAutomationSchedule(id).catch((error: Error) => {
      log.error({ error }, 'failed to unregister automation schedule');
    });

    return c.body(null, 204);
  },
);

automationsRouter.get('/:id', zValidator('param', automationIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await getAutomation(id);
  return c.json(result);
});

automationsRouter.get('/:id/sessions', zValidator('param', automationIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await listAutomationSessions(id);
  return c.json(result);
});

automationsRouter.post('/:id/run', zValidator('param', automationIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await runAutomation(id);
  return c.json(result, 201);
});
