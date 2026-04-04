import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { isServiceError } from '@/lib/service-result.js';
import { deleteSetting, listSettings, saveSetting } from '@/settings/service.js';

const settingValueSchema = z.object({ value: z.string() });

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const result = await listSettings();
  return c.json(result);
});

settingsRouter.put('/:key', zValidator('json', settingValueSchema), async (c) => {
  const key = c.req.param('key');
  const { value } = c.req.valid('json');
  const result = await saveSetting(key, value);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  if (key === 'profile.timezone') {
    try {
      await syncAllAutomationSchedules();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reschedule automations';
      return c.json({ error: message }, 500);
    }
  }

  return c.body(null, 204);
});

settingsRouter.delete('/:key', async (c) => {
  const key = c.req.param('key');
  const result = await deleteSetting(key);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  if (key === 'profile.timezone') {
    try {
      await syncAllAutomationSchedules();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reschedule automations';
      return c.json({ error: message }, 500);
    }
  }

  return c.body(null, 204);
});
