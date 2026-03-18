import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createAgent, deleteAgent, listAgents, updateAgent } from '@/agents/service.js';
import { isServiceError } from '@/lib/service-result.js';

export const agentsRouter = new Hono();

const createAgentSchema = z
  .object({
    name: z.string().trim().min(1),
    useBasePrompt: z.boolean().optional().default(true),
    systemPrompt: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      value.useBasePrompt ||
      (typeof value.systemPrompt === 'string' && value.systemPrompt.trim().length > 0),
    {
      message: 'systemPrompt is required when useBasePrompt is false',
      path: ['systemPrompt'],
    },
  );

const updateAgentSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    useBasePrompt: z.boolean().optional(),
    systemPrompt: z.string().nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.useBasePrompt !== undefined || value.systemPrompt !== undefined, {
    message: 'At least one field is required',
  });

agentsRouter.get('/', async (c) => {
  const rows = await listAgents();
  return c.json(rows);
});

agentsRouter.post('/', zValidator('json', createAgentSchema), async (c) => {
  const body = c.req.valid('json');

  const result = await createAgent({
    name: body.name,
    useBasePrompt: body.useBasePrompt,
    systemPrompt: body.systemPrompt ?? null,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 201);
});

agentsRouter.put('/:id', zValidator('json', updateAgentSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const result = await updateAgent(id, {
    name: body.name,
    useBasePrompt: body.useBasePrompt,
    systemPrompt: body.systemPrompt,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

agentsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteAgent(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});
