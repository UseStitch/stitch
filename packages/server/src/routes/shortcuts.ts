import { Hono } from 'hono';

import {
  clearShortcuts,
  deleteShortcut,
  listShortcuts,
  saveShortcut,
} from '@/shortcuts/service.js';
import { isServiceError } from '@/lib/service-result.js';

export const shortcutsRouter = new Hono();

shortcutsRouter.get('/', async (c) => {
  const result = await listShortcuts();
  return c.json(result);
});

shortcutsRouter.put('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  const body = (await c.req.json()) as { hotkey?: unknown };
  const result = await saveShortcut(actionId, body.hotkey);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

shortcutsRouter.delete('/', async (c) => {
  await clearShortcuts();
  return c.body(null, 204);
});

shortcutsRouter.delete('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  const result = await deleteShortcut(actionId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});
