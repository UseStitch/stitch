import fs from 'node:fs/promises';
import path from 'node:path';

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'connector-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

function getIconPath(slug: string, cacheDir: string): string {
  return path.join(cacheDir, `${slug}.svg`);
}

async function getSimpleIcon(slug: string): Promise<string | undefined> {
  if (!slug.trim()) return undefined;

  const cacheDir = PATHS.dirPaths.connectorIcons;
  const filePath = getIconPath(slug, cacheDir);

  const cached = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (cached) return cached;

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

export async function get(icon: ConnectorIconSource): Promise<string | undefined> {
  if (icon.type === 'svgString') {
    return icon.svgString;
  }
  return getSimpleIcon(icon.slug);
}
