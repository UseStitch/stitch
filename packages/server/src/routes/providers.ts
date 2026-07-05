import { Hono } from 'hono';

import { unwrapResult } from '@/lib/route-helpers.js';
import { listProvidersWithCapabilities, listEnabledSttModels } from '@/provider/service.js';

export const providersRouter = new Hono();

providersRouter.get('/', async (c) => {
  const result = await listProvidersWithCapabilities();
  return unwrapResult(c, result);
});

providersRouter.get('/stt/models', async (c) => {
  const result = await listEnabledSttModels();
  return unwrapResult(c, result);
});
