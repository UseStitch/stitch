import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { unwrapResult } from '@/lib/route-helpers.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';
import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { runMemoryMaintenance } from '@/memory/maintenance.js';
import {
  getAllSemanticMemories,
  searchSemanticMemories,
  updateSemanticMemory,
  deleteSemanticMemory,
  deleteSemanticMemories,
  getMemoryStats,
  pinSemanticMemory,
  pruneStaleMemories,
} from '@/memory/service.js';
import { dropSemanticTable } from '@/memory/store/tables.js';
import { MEMORY_CATEGORIES, MEMORY_CONFIDENCES, MEMORY_SOURCES } from '@/memory/types.js';
import { resetEmbedder } from '@/models/embedding/factory.js';
import type { Context } from 'hono';

const semanticQuerySchema = paginationQuerySchema({ pageSize: 20 }).extend({
  source: z.enum(MEMORY_SOURCES).optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  q: z.string().optional(),
});

const patchSchema = z.object({
  content: z.string().min(1).optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  confidence: z.enum(MEMORY_CONFIDENCES).optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
});

const pinSchema = z.object({
  pinned: z.boolean(),
});

export const memoryRouter = new Hono();

async function ensureMemoryActive(c: Context): Promise<Response | null> {
  const config = await getMemoryConfig();
  if (isMemoryActive(config)) {
    return null;
  }

  return c.json(
    {
      error:
        'Memory is unavailable. Enable memory and configure an embedding provider/model first.',
    },
    409,
  );
}

memoryRouter.get('/semantic', zValidator('query', semanticQuerySchema), async (c) => {
  const { source, category, q, page, pageSize } = c.req.valid('query');

  const config = await getMemoryConfig();
  if (!isMemoryActive(config)) {
    return c.json({ memories: [], page, pageSize, total: 0, totalPages: 0 });
  }

  if (q) {
    const result = await searchSemanticMemories({
      query: q,
      page,
      pageSize,
      sourceFilter: source,
      categoryFilter: category,
    });
    return unwrapResult(c, result);
  }

  const result = await getAllSemanticMemories({
    page,
    pageSize,
    sourceFilter: source,
    categoryFilter: category,
  });
  return unwrapResult(c, result);
});

memoryRouter.get('/stats', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const result = await getMemoryStats();
  return unwrapResult(c, result);
});

memoryRouter.post('/prune', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const config = await getMemoryConfig();
  const result = await pruneStaleMemories({
    maxMemories: config.maxMemories,
    staleDays: config.staleDays,
  });
  return unwrapResult(c, result, 204);
});

memoryRouter.patch('/semantic/:id/pin', zValidator('json', pinSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  const { pinned } = c.req.valid('json');

  const result = await pinSemanticMemory(id, pinned);
  return unwrapResult(c, result, 204);
});

memoryRouter.patch('/semantic/:id', zValidator('json', patchSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  const updates = c.req.valid('json');

  if (!updates.content && !updates.category && !updates.confidence) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  const result = await updateSemanticMemory(id, updates);
  return unwrapResult(c, result, 204);
});

memoryRouter.delete('/semantic/:id', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  const result = await deleteSemanticMemory(id);
  return unwrapResult(c, result, 204);
});

memoryRouter.delete('/semantic', zValidator('json', bulkDeleteSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const { ids } = c.req.valid('json');
  const result = await deleteSemanticMemories(ids);
  return unwrapResult(c, result, 204);
});

memoryRouter.post('/maintenance', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const result = await runMemoryMaintenance();
  return c.json(result);
});

memoryRouter.post('/reset', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  await dropSemanticTable();
  resetEmbedder();
  return c.body(null, 204);
});
