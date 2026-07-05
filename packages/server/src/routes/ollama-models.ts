import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { unwrapResult } from '@/lib/route-helpers.js';
import {
  OllamaModelInputSchema,
  deleteOllamaModel,
  discoverOllamaModels,
  getOllamaModel,
  listOllamaModels,
  upsertOllamaModel,
} from '@/models/llm/ollama.js';

export const ollamaModelsRouter = new Hono();

const discoverQuerySchema = z.object({ baseURL: z.string().optional() });

ollamaModelsRouter.get('/', async (c) => {
  const models = await listOllamaModels();
  return c.json(models);
});

ollamaModelsRouter.get('/discover', zValidator('query', discoverQuerySchema), async (c) => {
  const { baseURL } = c.req.valid('query');
  const result = await discoverOllamaModels(baseURL ?? 'http://localhost:11434');
  return unwrapResult(c, result);
});

ollamaModelsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await getOllamaModel(id);
  return unwrapResult(c, result);
});

ollamaModelsRouter.post('/', zValidator('json', OllamaModelInputSchema), async (c) => {
  const input = c.req.valid('json');
  const result = await upsertOllamaModel(input);
  return unwrapResult(c, result, 201);
});

ollamaModelsRouter.put('/:id', zValidator('json', OllamaModelInputSchema), async (c) => {
  const id = c.req.param('id');
  const input = { ...c.req.valid('json'), id };
  const result = await upsertOllamaModel(input);
  return unwrapResult(c, result);
});

ollamaModelsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteOllamaModel(id);
  return unwrapResult(c, result, 204);
});
