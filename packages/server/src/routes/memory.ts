import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

import { PATHS } from '@/lib/paths.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { getMemoryConfig } from '@/memory/config.js';
import { MemoryCapacityError, MemoryConflictError, MemoryPathError, memoryFileStore } from '@/memory/file-store.js';
import { runMemoryMaintenance } from '@/memory/maintenance.js';
import type { MemoryConsolidationStatus } from '@/memory/types.js';
import type { Context } from 'hono';

const runFile = promisify(execFile);
const fileNames = { memory: 'MEMORY.md', user: 'USER.md', dreams: 'DREAMS.md' } as const;
const targetSchema = z.enum(['memory', 'user']);
const entrySchema = z.object({ target: targetSchema, content: z.string().trim().min(1).max(1_000) });
const editEntrySchema = z.object({ content: z.string().trim().min(1).max(1_000), expectedHash: z.string().optional() });
const deleteEntrySchema = z.object({ expectedHash: z.string().optional() });
const rawFileSchema = z.object({ content: z.string(), expectedHash: z.string().min(1) });
const dailyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const searchSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const memoryRouter = new Hono();

memoryRouter.use('*', async (_c, next) => {
  await getMemoryConfig();
  await next();
});

async function ensureMemoryEnabled(c: Context): Promise<Response | null> {
  return (await getMemoryConfig()).enabled ? null : c.json({ error: 'Memory is disabled.' }, 409);
}

function memoryError(c: Context, error: unknown): Response {
  if (error instanceof MemoryConflictError) return c.json({ error: error.message, code: 'MEMORY_CONFLICT' }, 409);
  if (error instanceof MemoryCapacityError) {
    return c.json({ error: error.message, code: 'MEMORY_CAPACITY', capacity: error.capacity }, 409);
  }
  if (error instanceof MemoryPathError) return c.json({ error: error.message }, 400);
  throw error;
}

memoryRouter.get('/files', async (c) => {
  const [memory, user, dreams, dailyPaths, checkpoint] = await Promise.all([
    memoryFileStore.readCurated('memory'),
    memoryFileStore.readCurated('user'),
    memoryFileStore.readFile('DREAMS.md'),
    memoryFileStore.listDailyFiles(),
    memoryFileStore.readConsolidationState<{ lastRun?: MemoryConsolidationStatus; processedCandidateIds?: string[] }>(),
  ]);
  const daily = await Promise.all(dailyPaths.map((filePath) => memoryFileStore.readFile(filePath)));
  const consolidation: MemoryConsolidationStatus = checkpoint?.lastRun ?? {
    status: 'never',
    lastRunAt: null,
    summary: null,
    candidateCount: 0,
    promotedCount: 0,
    rejectedCount: 0,
  };
  const processedCandidateIds = checkpoint?.processedCandidateIds ?? [];
  const processed = new Set(processedCandidateIds);
  return c.json({
    memory,
    user,
    dreams,
    pendingCandidateCount: daily.reduce(
      (total, file) => total + file.entries.filter((entry) => !processed.has(entry.id)).length,
      0,
    ),
    processedCandidateIds,
    consolidation,
  });
});

memoryRouter.get('/files/:name', async (c) => {
  const name = c.req.param('name') as keyof typeof fileNames;
  const fileName = fileNames[name];
  if (!fileName) return c.json({ error: 'Unknown memory file.' }, 404);
  return c.json(await memoryFileStore.readFile(fileName));
});

memoryRouter.put('/files/:name', zValidator('json', rawFileSchema), async (c) => {
  const name = c.req.param('name');
  if (name !== 'memory' && name !== 'user') return c.json({ error: 'Only curated files can be edited.' }, 400);
  const body = c.req.valid('json');
  try {
    return c.json(await memoryFileStore.writeRaw(fileNames[name], body.content, body.expectedHash));
  } catch (error) {
    return memoryError(c, error);
  }
});

memoryRouter.post('/entries', zValidator('json', entrySchema), async (c) => {
  const inactive = await ensureMemoryEnabled(c);
  if (inactive) return inactive;
  const body = c.req.valid('json');
  try {
    const snapshot = await memoryFileStore.mutate(body.target, [
      { type: 'add', content: body.content, origin: 'user', source: 'ui' },
    ]);
    return c.json(snapshot, 201);
  } catch (error) {
    return memoryError(c, error);
  }
});

memoryRouter.patch('/entries/:id', zValidator('json', editEntrySchema), async (c) => {
  const body = c.req.valid('json');
  try {
    return c.json(await memoryFileStore.updateEntry(c.req.param('id'), body.content, body.expectedHash));
  } catch (error) {
    return memoryError(c, error);
  }
});

memoryRouter.delete('/entries/:id', zValidator('json', deleteEntrySchema), async (c) => {
  const body = c.req.valid('json');
  try {
    return c.json(await memoryFileStore.deleteEntry(c.req.param('id'), body.expectedHash));
  } catch (error) {
    return memoryError(c, error);
  }
});

memoryRouter.get('/daily', zValidator('query', dailyQuerySchema), async (c) => {
  const { page, pageSize } = c.req.valid('query');
  const paths = await memoryFileStore.listDailyFiles();
  const selected = paths.slice((page - 1) * pageSize, page * pageSize);
  return c.json({
    files: await Promise.all(selected.map((filePath) => memoryFileStore.readFile(filePath))),
    page,
    pageSize,
    total: paths.length,
    totalPages: Math.ceil(paths.length / pageSize),
  });
});

memoryRouter.get('/search', zValidator('query', searchSchema), async (c) => {
  const { q, limit } = c.req.valid('query');
  return c.json({ results: await memoryFileStore.search(q, limit) });
});

memoryRouter.post('/consolidate', async (c) => {
  const inactive = await ensureMemoryEnabled(c);
  if (inactive) return inactive;
  return unwrapResult(c, await runMemoryMaintenance());
});

memoryRouter.post('/reset', zValidator('json', z.object({ confirm: z.literal(true) })), async (c) => {
  await memoryFileStore.reset();
  return c.body(null, 204);
});

memoryRouter.post('/open-folder', async (c) => {
  await memoryFileStore.ensureInitialized();
  if (process.platform === 'win32') await runFile('explorer.exe', [PATHS.dirPaths.memory]);
  else if (process.platform === 'darwin') await runFile('open', [PATHS.dirPaths.memory]);
  else await runFile('xdg-open', [PATHS.dirPaths.memory]);
  return c.body(null, 204);
});
