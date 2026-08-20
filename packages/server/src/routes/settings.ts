import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { deleteSetting, listSettings, saveSetting } from '@/settings/service.js';

const settingValueSchema = z.object({ value: z.string() });
const settingKeySchema = z.object({ key: z.string().min(1) });

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const result = await listSettings();
  return c.json(result);
});

settingsRouter.put(
  '/:key',
  zValidator('param', settingKeySchema),
  zValidator('json', settingValueSchema),
  async (c) => {
    const { key } = c.req.valid('param');
    const { value } = c.req.valid('json');
    await saveSetting(key, value);
    return c.body(null, 204);
  },
);

settingsRouter.delete('/:key', zValidator('param', settingKeySchema), async (c) => {
  const { key } = c.req.valid('param');
  await deleteSetting(key);
  return c.body(null, 204);
});
