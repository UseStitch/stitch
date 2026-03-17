import { Hono } from 'hono';

import { isServiceError } from '@/lib/service-result.js';
import { deleteSetting, listSettings, saveSetting } from '@/settings/service.js';

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const result = await listSettings();
  return c.json(result);
});

settingsRouter.put('/:key', async (c) => {
  const key = c.req.param('key');
  const body = (await c.req.json()) as { value?: unknown };
  const result = await saveSetting(key, body.value);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

settingsRouter.delete('/:key', async (c) => {
  const key = c.req.param('key');
  const result = await deleteSetting(key);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});
