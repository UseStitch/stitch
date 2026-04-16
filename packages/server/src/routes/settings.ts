import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { unwrapResult } from '@/lib/route-helpers.js';
import { deleteSetting, listSettings, saveSetting } from '@/settings/service.js';

const settingValueSchema = z.object({ value: z.string() });
const settingKeySchema = z.object({ key: z.string().min(1) });

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const result = await listSettings();
  return unwrapResult(c, result);
});

settingsRouter.put(
  '/:key',
  zValidator('param', settingKeySchema),
  zValidator('json', settingValueSchema),
  async (c) => {
    const { key } = c.req.valid('param');
    const { value } = c.req.valid('json');
    const result = await saveSetting(key, value);
    return unwrapResult(c, result, 204);
  },
);

settingsRouter.delete('/:key', zValidator('param', settingKeySchema), async (c) => {
  const { key } = c.req.valid('param');
  const result = await deleteSetting(key);
  return unwrapResult(c, result, 204);
});
