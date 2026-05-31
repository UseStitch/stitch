import path from 'node:path';

import { readCachedText, writeCachedText } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'simple-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

export async function getSimpleIcon(slug: string): Promise<string | undefined> {
  if (!slug.trim()) return undefined;

  const cacheDir = PATHS.dirPaths.simpleIcons;
  const filePath = path.join(cacheDir, `${slug}.svg`);

  const cached = await readCachedText(filePath);
  if (cached) return cached;

  const result = await fetch(`${SIMPLE_ICONS_CDN}/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch((error: unknown) => {
    log.warn({ error, slug }, 'failed to fetch simple icon');
  });

  if (!result || !result.ok) return undefined;

  const svg = await result.text();
  await writeCachedText(filePath, svg);
  return svg;
}
