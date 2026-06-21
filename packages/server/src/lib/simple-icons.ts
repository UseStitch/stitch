import path from 'node:path';

import { readCachedText, writeCachedText } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

const log = Log.create({ service: 'simple-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

export async function getSimpleIcon(slug: string): Promise<ServiceResult<string>> {
  if (!slug.trim()) return err('Icon not found', 404);

  const cacheDir = PATHS.dirPaths.simpleIcons;
  const filePath = path.join(cacheDir, `${slug}.svg`);

  const cached = await readCachedText(filePath);
  if (cached) return ok(cached);

  const result = await fetch(`${SIMPLE_ICONS_CDN}/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch((error: unknown) => {
    log.warn({ error, slug }, 'failed to fetch simple icon');
  });

  if (!result || !result.ok) return err('Icon not found', 404);

  const svg = await result.text();
  await writeCachedText(filePath, svg);
  return ok(svg);
}
