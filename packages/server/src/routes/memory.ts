import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { resetEmbedder } from '@/memory/embedding/factory.js';
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
import { MEMORY_CATEGORIES, MEMORY_CONFIDENCES } from '@/memory/types.js';
import type { Context } from 'hono';

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

function parsePagination(query: Record<string, string | undefined>) {
  const pageRaw = Number.parseInt(query.page ?? '1', 10);
  const pageSizeRaw = Number.parseInt(query.pageSize ?? '20', 10);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 20;

  return { page, pageSize };
}

memoryRouter.get('/semantic', async (c) => {
  const source = c.req.query('source');
  const category = c.req.query('category');
  const q = c.req.query('q');
  const { page, pageSize } = parsePagination({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });

  const config = await getMemoryConfig();
  if (!isMemoryActive(config)) {
    return c.json({ memories: [], page, pageSize, total: 0, totalPages: 0 });
  }

  if (q) {
    const results = await searchSemanticMemories({
      query: q,
      page,
      pageSize,
      sourceFilter: source as 'chat' | 'automation' | undefined,
      categoryFilter: category as (typeof MEMORY_CATEGORIES)[number] | undefined,
    });
    return c.json(results);
  }

  const memories = await getAllSemanticMemories({
    page,
    pageSize,
    sourceFilter: source as 'chat' | 'automation' | undefined,
    categoryFilter: category as (typeof MEMORY_CATEGORIES)[number] | undefined,
  });
  return c.json(memories);
});

memoryRouter.get('/stats', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;
  
  const stats = await getMemoryStats();
  return c.json(stats);
});

memoryRouter.post('/prune', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;
  
  const config = await getMemoryConfig();
  await pruneStaleMemories({
    maxMemories: config.maxMemories,
    staleDays: config.staleDays,
  });
  
  return c.body(null, 204);
});

memoryRouter.patch('/semantic/:id/pin', zValidator('json', pinSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  const { pinned } = c.req.valid('json');

  await pinSemanticMemory(id, pinned);
  return c.body(null, 204);
});

memoryRouter.patch('/semantic/:id', zValidator('json', patchSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  const updates = c.req.valid('json');

  if (!updates.content && !updates.category && !updates.confidence) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  await updateSemanticMemory(id, updates);
  return c.body(null, 204);
});

memoryRouter.delete('/semantic/:id', async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const id = c.req.param('id');
  await deleteSemanticMemory(id);
  return c.body(null, 204);
});

memoryRouter.delete('/semantic', zValidator('json', bulkDeleteSchema), async (c) => {
  const inactiveResponse = await ensureMemoryActive(c);
  if (inactiveResponse) return inactiveResponse;

  const { ids } = c.req.valid('json');
  await deleteSemanticMemories(ids);
  return c.body(null, 204);
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
