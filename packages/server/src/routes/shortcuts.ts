import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { unwrapResult } from '@/lib/route-helpers.js';
import { deleteShortcut, listShortcuts, resetShortcuts, saveShortcut } from '@/shortcuts/service.js';

const shortcutSchema = z.object({ hotkey: z.string().optional() });

export const shortcutsRouter = new Hono();

shortcutsRouter.get('/', async (c) => {
  const result = await listShortcuts();
  return unwrapResult(c, result);
});

shortcutsRouter.put('/:actionId', zValidator('json', shortcutSchema), async (c) => {
  const actionId = c.req.param('actionId');
  const { hotkey } = c.req.valid('json');
  const result = await saveShortcut(actionId, hotkey);
  return unwrapResult(c, result, 204);
});

shortcutsRouter.delete('/', async (c) => {
  const result = await resetShortcuts();
  return unwrapResult(c, result, 204);
});

shortcutsRouter.delete('/:actionId', async (c) => {
  const actionId = c.req.param('actionId');
  const result = await deleteShortcut(actionId);
  return unwrapResult(c, result, 204);
});
