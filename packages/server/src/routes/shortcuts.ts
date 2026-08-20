import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { deleteShortcut, listShortcuts, resetShortcuts, saveShortcut } from '@/shortcuts/service.js';

const shortcutSchema = z.object({ hotkey: z.string().optional() });

export const shortcutsRouter = new Hono();

shortcutsRouter.get('/', async (c) => {
  const result = await listShortcuts();
  return c.json(result);
});

shortcutsRouter.put('/:actionId', zValidator('json', shortcutSchema), async (c) => {
  const actionId = c.req.param('actionId');
  const { hotkey } = c.req.valid('json');
  await saveShortcut(actionId, hotkey);
  return c.body(null, 204);
});

shortcutsRouter.delete('/', async (c) => {
  await resetShortcuts();
  return c.body(null, 204);
});

shortcutsRouter.delete('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  await deleteShortcut(actionId);
  return c.body(null, 204);
});
