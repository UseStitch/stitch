import { Hono } from 'hono';

import { listProvidersWithCapabilities, listEnabledSttModels } from '@/provider/service.js';

export const providersRouter = new Hono();

providersRouter.get('/', async (c) => {
  const result = await listProvidersWithCapabilities();
  return c.json(result);
});

providersRouter.get('/stt/models', async (c) => {
  const result = await listEnabledSttModels();
  return c.json(result);
});
