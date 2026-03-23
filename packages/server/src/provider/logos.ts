import fs from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { isAllowedProvider } from '@/provider/models.js';

const log = Log.create({ service: 'provider-logos' });
const LOGO_BASE_URL = 'https://models.dev/logos';

type GetProviderLogoOptions = {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
};

function getLogoPath(providerId: string, cacheDir: string): string {
  return path.join(cacheDir, `${providerId}.svg`);
}

export async function get(
  providerId: string,
  options: GetProviderLogoOptions = {},
): Promise<string | undefined> {
  if (!isAllowedProvider(providerId)) return undefined;

  const cacheDir = options.cacheDir ?? PATHS.dirPaths.providerLogos;
  const filePath = getLogoPath(providerId, cacheDir);

  const cached = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  if (cached) return cached;

  const fetchImpl = options.fetchImpl ?? fetch;
  const result = await fetchImpl(`${LOGO_BASE_URL}/${providerId}.svg`, {
    signal: AbortSignal.timeout(10 * 1000),
  }).catch((error) => {
    log.warn({ error, providerId }, 'failed to fetch provider logo');
  });

  if (!result || !result.ok) return undefined;

  const svg = await result.text();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(filePath, svg, 'utf8');
  return svg;
}
