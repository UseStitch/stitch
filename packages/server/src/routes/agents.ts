import { Hono } from 'hono';
import { asc } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { agents } from '@/db/schema.js';

export const agentsRouter = new Hono();

agentsRouter.get('/', async (c) => {
  const db = getDb();
  const rows = await db.select().from(agents).orderBy(asc(agents.createdAt));
  return c.json(rows);
});
