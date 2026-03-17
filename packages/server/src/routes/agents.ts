import { Hono } from 'hono';

import { listAgents } from '@/agents/service.js';

export const agentsRouter = new Hono();

agentsRouter.get('/', async (c) => {
  const rows = await listAgents();
  return c.json(rows);
});
