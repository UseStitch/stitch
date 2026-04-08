import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { resetEmbedder } from '@/memory/embedding/factory.js';
import {
  getAllSemanticMemories,
  searchSemanticMemories,
  updateSemanticMemory,
  deleteSemanticMemory,
  deleteSemanticMemories,
} from '@/memory/service.js';
import { dropSemanticTable } from '@/memory/store/tables.js';
import { MEMORY_CATEGORIES, MEMORY_CONFIDENCES } from '@/memory/types.js';

const patchSchema = z.object({
  content: z.string().min(1).optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  confidence: z.enum(MEMORY_CONFIDENCES).optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const memoryRouter = new Hono();

memoryRouter.get('/semantic', async (c) => {
  const source = c.req.query('source');
  const q = c.req.query('q');

  if (q) {
    const results = await searchSemanticMemories(q, 50, source as 'chat' | 'automation' | undefined);
    return c.json(results);
  }

  const memories = await getAllSemanticMemories(source as 'chat' | 'automation' | undefined);
  return c.json(memories);
});

memoryRouter.patch('/semantic/:id', zValidator('json', patchSchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');

  if (!updates.content && !updates.category && !updates.confidence) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  await updateSemanticMemory(id, updates);
  return c.body(null, 204);
});

memoryRouter.delete('/semantic/:id', async (c) => {
  const id = c.req.param('id');
  await deleteSemanticMemory(id);
  return c.body(null, 204);
});

memoryRouter.delete('/semantic', zValidator('json', bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid('json');
  await deleteSemanticMemories(ids);
  return c.body(null, 204);
});

memoryRouter.post('/reset', async (c) => {
  await dropSemanticTable();
  resetEmbedder();
  return c.body(null, 204);
});
