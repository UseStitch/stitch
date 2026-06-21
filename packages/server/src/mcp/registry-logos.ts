import { eq } from 'drizzle-orm';
import path from 'node:path';

import type { PrefixedString } from '@stitch/shared/id';
import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpServers } from '@/db/schema/mcp.js';
import { isSvgResponse, readCachedText, writeCachedText } from '@/lib/icon-cache.js';
import type { FetchLike } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { findMcpRegistryServerForInstall, listMcpRegistryServers } from '@/mcp/registry-service.js';

const log = Log.create({ service: 'mcp-registry-logos' });
const REGISTRY_ID_REGEX = /^[a-z0-9][a-z0-9._-]*$/i;

type GetRegistryLogoOptions = {
  cacheDir?: string;
  registryCacheFilePath?: string;
  fetchImpl?: FetchLike;
};

function getLogoPath(registryId: string, cacheDir: string): string {
  return path.join(cacheDir, `${registryId}.svg`);
}

function isValidRegistryId(registryId: string): boolean {
  return REGISTRY_ID_REGEX.test(registryId);
}

function isAllowedLogoUrl(logoUrl: string): boolean {
  try {
    return new URL(logoUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchAndCacheLogo(
  server: McpRegistryServer,
  filePath: string,
  cacheDir: string,
  fetchImpl: FetchLike,
): Promise<string | undefined> {
  if (!server.logoUrl || !isAllowedLogoUrl(server.logoUrl)) return undefined;

  const response = await fetchImpl(server.logoUrl, { signal: AbortSignal.timeout(10_000) }).catch(
    (error) => {
      log.warn({ error, registryId: server.id }, 'failed to fetch MCP registry logo');
    },
  );
  if (!response || !response.ok || !isSvgResponse(response)) return undefined;

  const svg = await response.text();
  await writeCachedText(filePath, svg);
  return svg;
}

export async function getMcpRegistryLogo(
  registryId: string,
  options: GetRegistryLogoOptions = {},
): Promise<string | undefined> {
  if (!isValidRegistryId(registryId)) return undefined;

  const cacheDir = options.cacheDir ?? PATHS.dirPaths.mcpRegistryLogos;
  const filePath = getLogoPath(registryId, cacheDir);
  const cached = await readCachedText(filePath);
  if (cached) return cached;

  const result = await listMcpRegistryServers({ cacheFilePath: options.registryCacheFilePath });
  if (result.error) return undefined;

  const server = result.data.find((entry) => entry.id === registryId);
  if (!server) return undefined;

  return fetchAndCacheLogo(server, filePath, cacheDir, options.fetchImpl ?? fetch);
}

export async function getMcpInstalledServerRegistryLogo(
  serverId: string,
): Promise<string | undefined> {
  const db = getDb();
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!server) return undefined;

  const registryServer = await findMcpRegistryServerForInstall({
    name: server.name,
    url: server.url,
  });
  if (!registryServer) return undefined;

  return getMcpRegistryLogo(registryServer.id);
}
