import fs from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'connector-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

const BUNDLED_ICONS: Record<string, string> = {};

const ALLOWED_SLUGS = new Set([
  'google',
  'gmail',
  'googledrive',
  'googlecalendar',
  'googledocs',
]);

function getIconPath(slug: string, cacheDir: string): string {
  return path.join(cacheDir, `${slug}.svg`);
}

export async function get(slug: string): Promise<string | undefined> {
  if (!ALLOWED_SLUGS.has(slug)) return undefined;

  const cacheDir = PATHS.dirPaths.connectorIcons;
  const filePath = getIconPath(slug, cacheDir);

  const cached = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (cached) return cached;

  // Check bundled icons first
  const bundled = BUNDLED_ICONS[slug];
  if (bundled) {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(filePath, bundled, 'utf8');
    return bundled;
  }

  // Fetch from Simple Icons CDN
  const result = await fetch(`${SIMPLE_ICONS_CDN}/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch((error: unknown) => {
    log.warn({ error, slug }, 'failed to fetch connector icon');
  });

  if (!result || !result.ok) return undefined;

  const svg = await result.text();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(filePath, svg, 'utf8');
  return svg;
}
