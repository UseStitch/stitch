import path from 'node:path';

import { fetchCachedSvg } from '@/lib/icon-cache.js';
import { PATHS } from '@/lib/paths.js';
import { isAllowedProvider } from '@/models/llm/registry.js';

const LOGO_BASE_URL = 'https://models.dev/logos';

const PROVIDER_LOGO_ALIASES: Record<string, string> = { ollama_local: 'ollama-cloud' };

type GetProviderLogoOptions = { cacheDir?: string };

export async function get(providerId: string, options: GetProviderLogoOptions = {}): Promise<string | undefined> {
  if (!isAllowedProvider(providerId)) return undefined;

  const logoId = PROVIDER_LOGO_ALIASES[providerId] ?? providerId;
  const cacheDir = options.cacheDir ?? PATHS.dirPaths.providerLogos;
  const filePath = path.join(cacheDir, `${logoId}.svg`);

  return fetchCachedSvg(`${LOGO_BASE_URL}/${logoId}.svg`, filePath);
}
