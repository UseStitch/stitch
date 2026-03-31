import fs from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'connector-icons' });
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

// Icons not available on Simple Icons CDN that we bundle locally
const BUNDLED_ICONS: Record<string, string> = {
  // Slack was removed from Simple Icons (Salesforce ownership)
  slack: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Slack</title><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
};

const ALLOWED_SLUGS = new Set([
  'google',
  'gmail',
  'googledrive',
  'googlecalendar',
  'googledocs',
  'slack',
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
