import { Hono } from 'hono';

import { getSimpleIcon } from '@/lib/simple-icons.js';

export const iconsRouter = new Hono();

iconsRouter.get('/simple-icons/:slug', async (c) => {
  const slug = c.req.param('slug');
  const svg = await getSimpleIcon(slug);
  if (!svg) return c.json({ error: 'Icon not found' }, 404);

  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(svg, 200);
});
