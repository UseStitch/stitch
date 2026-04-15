import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { isServiceError } from '@/lib/service-result.js';
import {
  OllamaModelInputSchema,
  deleteOllamaModel,
  discoverOllamaModels,
  getOllamaModel,
  listOllamaModels,
  upsertOllamaModel,
} from '@/llm/provider/ollama-models.js';

export const ollamaModelsRouter = new Hono();

const discoverQuerySchema = z.object({
  baseURL: z.string().optional(),
});

ollamaModelsRouter.get('/', async (c) => {
  const models = await listOllamaModels();
  return c.json(models);
});

ollamaModelsRouter.get('/discover', zValidator('query', discoverQuerySchema), async (c) => {
  const { baseURL } = c.req.valid('query');
  const result = await discoverOllamaModels(baseURL ?? 'http://localhost:11434');
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

ollamaModelsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await getOllamaModel(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

ollamaModelsRouter.post('/', zValidator('json', OllamaModelInputSchema), async (c) => {
  const input = c.req.valid('json');
  const result = await upsertOllamaModel(input);
  if (isServiceError(result)) {
    return c.json({ error: result.error, details: result.details }, result.status);
  }
  return c.json(result.data, 201);
});

ollamaModelsRouter.put('/:id', zValidator('json', OllamaModelInputSchema), async (c) => {
  const id = c.req.param('id');
  const input = { ...c.req.valid('json'), id };
  const result = await upsertOllamaModel(input);
  if (isServiceError(result)) {
    return c.json({ error: result.error, details: result.details }, result.status);
  }
  return c.json(result.data);
});

ollamaModelsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteOllamaModel(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});
