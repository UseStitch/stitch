import { HTTPException } from 'hono/http-exception';
import path from 'node:path';

import { fetchCachedSvg } from '@/lib/icon-cache.js';
import { PATHS } from '@/lib/paths.js';

const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

export async function getSimpleIcon(slug: string): Promise<string> {
  if (!slug.trim()) throw new HTTPException(404, { message: 'Icon not found' });

  const filePath = path.join(PATHS.dirPaths.simpleIcons, `${slug}.svg`);
  const svg = await fetchCachedSvg(`${SIMPLE_ICONS_CDN}/${slug}`, filePath);
  if (!svg) throw new HTTPException(404, { message: 'Icon not found' });

  return svg;
}
