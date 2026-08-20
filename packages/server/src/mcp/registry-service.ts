import { HTTPException } from 'hono/http-exception';
import z from 'zod';

import type { McpRegistryPayload, McpRegistryServer } from '@stitch/shared/mcp/types';

import type { FetchLike } from '@/lib/icon-cache.js';
import { PATHS } from '@/lib/paths.js';
import { createRegistryCache, getStitchRegistryUserAgent } from '@/lib/registry-cache.js';

const DEFAULT_MCP_REGISTRY_URL = 'https://usestitch.ai/mcp-registry.json';

const noneAuthConfigSchema = z.object({ type: z.literal('none') });
const apiKeyAuthConfigSchema = z.object({ type: z.literal('api_key'), apiKey: z.string().min(1) });
const headersAuthConfigSchema = z.object({ type: z.literal('headers'), headers: z.record(z.string(), z.string()) });
const oauthAuthConfigSchema = z.object({
  type: z.literal('oauth'),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});
const authConfigSchema = z.discriminatedUnion('type', [
  noneAuthConfigSchema,
  apiKeyAuthConfigSchema,
  headersAuthConfigSchema,
  oauthAuthConfigSchema,
]);

const mcpRegistryServerSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  homepageUrl: z.url().optional(),
  docsUrl: z.url(),
  logoUrl: z.url().optional(),
  tags: z.array(z.string().min(1)).min(1),
  install: z.object({
    name: z.string().min(1),
    transport: z.enum(['stdio', 'http']),
    url: z.url(),
    authConfig: authConfigSchema,
    optionalAuthConfigs: z.array(authConfigSchema).optional(),
  }),
});

const mcpRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.iso.datetime({ offset: true }),
  servers: z.array(mcpRegistryServerSchema),
});

type ListRegistryOptions = { cacheFilePath?: string; fetchImpl?: FetchLike };
type RefreshRegistryOptions = ListRegistryOptions & { force?: boolean };

function getRegistryUrl(): string {
  return process.env['STITCH_MCP_REGISTRY_URL']?.trim() || DEFAULT_MCP_REGISTRY_URL;
}

function normalizeServers(payload: McpRegistryPayload): McpRegistryServer[] {
  return payload.servers.toSorted((a, b) => a.name.localeCompare(b.name));
}

function createMcpRegistryCache(cacheFilePath = PATHS.filePaths.mcpRegistry) {
  return createRegistryCache<McpRegistryPayload>({
    cacheFilePath,
    get url() {
      return getRegistryUrl();
    },
    parse: (raw) => mcpRegistryPayloadSchema.parse(raw),
    userAgent: getStitchRegistryUserAgent,
  });
}

const mcpRegistryCache = createMcpRegistryCache();

export async function refreshMcpRegistryCache(options: RefreshRegistryOptions = {}): Promise<McpRegistryPayload> {
  const cache = options.cacheFilePath ? createMcpRegistryCache(options.cacheFilePath) : mcpRegistryCache;
  try {
    await cache.refresh(options.fetchImpl);
    return await cache.get(options.fetchImpl);
  } catch (error) {
    const message = Error.isError(error) ? error.message : String(error);
    throw new HTTPException(500, { message: `Failed to refresh MCP registry: ${message}` });
  }
}

export async function reloadMcpRegistryCacheFromDisk(
  options: { cacheFilePath?: string } = {},
): Promise<McpRegistryPayload> {
  const cache = options.cacheFilePath ? createMcpRegistryCache(options.cacheFilePath) : mcpRegistryCache;
  const fromDisk = await cache.reloadFromDisk();
  if (!fromDisk) {
    throw new HTTPException(404, { message: 'No registry cache found on disk' });
  }
  return fromDisk;
}

export async function listMcpRegistryServers(options: ListRegistryOptions = {}): Promise<McpRegistryServer[]> {
  const cache = options.cacheFilePath ? createMcpRegistryCache(options.cacheFilePath) : mcpRegistryCache;
  try {
    const payload = await cache.get(options.fetchImpl);
    return normalizeServers(payload);
  } catch (error) {
    const message = Error.isError(error) ? error.message : String(error);
    throw new HTTPException(500, { message: `Failed to load MCP registry: ${message}` });
  }
}

export async function findMcpRegistryServerForInstall(input: {
  name: string;
  url: string;
}): Promise<McpRegistryServer | null> {
  try {
    const servers = await listMcpRegistryServers();
    const normalizedUrl = input.url.trim().toLowerCase();
    const normalizedName = input.name.trim().toLowerCase();

    return (
      servers.find((server) => server.install.url.trim().toLowerCase() === normalizedUrl) ??
      servers.find((server) => server.install.name.trim().toLowerCase() === normalizedName) ??
      servers.find((server) => server.name.trim().toLowerCase() === normalizedName) ??
      null
    );
  } catch {
    return null;
  }
}

export function clearMcpRegistryCacheForTests(): void {
  mcpRegistryCache.reset();
}
