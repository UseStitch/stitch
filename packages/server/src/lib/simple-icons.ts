import fs from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'simple-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

export async function getSimpleIcon(slug: string): Promise<string | undefined> {
  if (!slug.trim()) return undefined;

  const cacheDir = PATHS.dirPaths.simpleIcons;
  const filePath = path.join(cacheDir, `${slug}.svg`);

  const cached = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (cached) return cached;

  const result = await fetch(`${SIMPLE_ICONS_CDN}/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch((error: unknown) => {
    log.warn({ error, slug }, 'failed to fetch simple icon');
  });

  if (!result || !result.ok) return undefined;

  const svg = await result.text();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(filePath, svg, 'utf8');
  return svg;
}
