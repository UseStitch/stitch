import path from 'node:path';

import { readCachedText, writeCachedText } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { isAllowedProvider } from '@/models/llm/registry.js';

const log = Log.create({ service: 'provider-logos' });
const LOGO_BASE_URL = 'https://models.dev/logos';

const PROVIDER_LOGO_ALIASES: Record<string, string> = { ollama_local: 'ollama-cloud' };

type GetProviderLogoOptions = { cacheDir?: string };

function getLogoPath(providerId: string, cacheDir: string): string {
  return path.join(cacheDir, `${providerId}.svg`);
}

export async function get(providerId: string, options: GetProviderLogoOptions = {}): Promise<string | undefined> {
  if (!isAllowedProvider(providerId)) return undefined;

  const logoId = PROVIDER_LOGO_ALIASES[providerId] ?? providerId;
  const cacheDir = options.cacheDir ?? PATHS.dirPaths.providerLogos;
  const filePath = getLogoPath(logoId, cacheDir);

  const cached = await readCachedText(filePath);
  if (cached) return cached;

  const result = await fetch(`${LOGO_BASE_URL}/${logoId}.svg`, { signal: AbortSignal.timeout(10 * 1000) }).catch(
    (error) => {
      log.warn({ error, providerId }, 'failed to fetch provider logo');
    },
  );

  if (!result || !result.ok) return undefined;

  const svg = await result.text();
  await writeCachedText(filePath, svg);
  return svg;
}
