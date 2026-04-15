import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type {
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';

import { syncAutomationSchedule, unregisterAutomationSchedule } from '@/automations/scheduler.js';
import {
  createAutomation,
  deleteAutomation,
  listAutomationSessions,
  listAutomations,
  runAutomation,
  updateAutomation,
} from '@/automations/service.js';
import { isServiceError } from '@/lib/service-result.js';
import { unwrapResult } from '@/lib/route-helpers.js';

const scheduleSchema = z
  .object({
    type: z.literal('cron'),
    expression: z.string().trim().min(1),
  })
  .nullable();

const createAutomationSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  initialMessage: z.string().trim().min(1),
  schedule: scheduleSchema.optional().default(null),
});

const updateAutomationSchema = createAutomationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const automationsRouter = new Hono();

function parsePagination(query: Record<string, string | undefined>) {
  const pageRaw = Number.parseInt(query.page ?? '1', 10);
  const pageSizeRaw = Number.parseInt(query.pageSize ?? '10', 10);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 10;

  return { page, pageSize };
}

automationsRouter.get('/', async (c) => {
  const { page, pageSize } = parsePagination({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const result = await listAutomations({ page, pageSize });
  return c.json(result);
});

automationsRouter.post('/', zValidator('json', createAutomationSchema), async (c) => {
  const body = c.req.valid('json') as CreateAutomationInput;
  const result = await createAutomation(body);
  if (isServiceError(result)) return unwrapResult(c, result);

  try {
    await syncAutomationSchedule(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule automation';
    return c.json({ error: message }, 500);
  }

  return unwrapResult(c, result, 201);
});

automationsRouter.patch('/:id', zValidator('json', updateAutomationSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json') as UpdateAutomationInput;
  const result = await updateAutomation(id, body);
  if (isServiceError(result)) return unwrapResult(c, result);

  try {
    await syncAutomationSchedule(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule automation';
    return c.json({ error: message }, 500);
  }

  return unwrapResult(c, result);
});

automationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteAutomation(id);
  if (isServiceError(result)) return unwrapResult(c, result);

  await unregisterAutomationSchedule(id).catch(() => {});

  return unwrapResult(c, result, 204);
});

automationsRouter.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const result = await listAutomationSessions(id);
  return unwrapResult(c, result);
});

automationsRouter.post('/:id/run', async (c) => {
  const id = c.req.param('id');
  const result = await runAutomation(id);
  return unwrapResult(c, result, 201);
});
