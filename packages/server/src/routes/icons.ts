import { Hono } from 'hono';

import { ICON_CACHE_CONTROL, SVG_CONTENT_TYPE } from '@/lib/icon-cache.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { getSimpleIcon } from '@/lib/simple-icons.js';

export const iconsRouter = new Hono();

iconsRouter.get('/simple-icons/:slug', async (c) => {
  const slug = c.req.param('slug');
  const result = await getSimpleIcon(slug);
  if (result.error) return unwrapResult(c, result);

  c.header('Content-Type', SVG_CONTENT_TYPE);
  c.header('Cache-Control', ICON_CACHE_CONTROL);
  return c.body(result.data, 200);
});
