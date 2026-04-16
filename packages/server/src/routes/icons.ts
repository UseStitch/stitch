import { Hono } from 'hono';

import { requireFound, unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import { getSimpleIcon } from '@/lib/simple-icons.js';

export const iconsRouter = new Hono();

iconsRouter.get('/simple-icons/:slug', async (c) => {
  const slug = c.req.param('slug');
  const svg = await getSimpleIcon(slug);
  const result = requireFound(svg, 'Icon');
  if (isServiceError(result)) return unwrapResult(c, result);

  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(result.data, 200);
});
