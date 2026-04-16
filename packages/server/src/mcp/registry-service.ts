import fs from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';

import type { McpRegistryPayload, McpRegistryServer } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { isServiceError } from '@/lib/service-result.js';

const log = Log.create({ service: 'mcp-registry' });
const DEFAULT_MCP_REGISTRY_URL = 'https://usestitch.ai/mcp-registry.json';
const FETCH_TIMEOUT_MS = 10_000;

const noneAuthConfigSchema = z.object({ type: z.literal('none') });
const apiKeyAuthConfigSchema = z.object({ type: z.literal('api_key'), apiKey: z.string().min(1) });
const headersAuthConfigSchema = z.object({
  type: z.literal('headers'),
  headers: z.record(z.string(), z.string()),
});
const authConfigSchema = z.discriminatedUnion('type', [
  noneAuthConfigSchema,
  apiKeyAuthConfigSchema,
  headersAuthConfigSchema,
]);

const mcpRegistryServerSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  homepageUrl: z.string().url().optional(),
  docsUrl: z.string().url(),
  tags: z.array(z.string().min(1)).min(1),
  install: z.object({
    name: z.string().min(1),
    transport: z.enum(['stdio', 'http']),
    url: z.string().url(),
    authConfig: authConfigSchema,
    optionalAuthConfigs: z.array(authConfigSchema).optional(),
  }),
});

const mcpRegistryPayloadSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  servers: z.array(mcpRegistryServerSchema),
});

type ListRegistryOptions = {
  cacheFilePath?: string;
  fetchImpl?: FetchLike;
};

type RefreshRegistryOptions = ListRegistryOptions & {
  force?: boolean;
};

let inMemoryRegistry: McpRegistryPayload | null = null;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function parseRegistryPayload(raw: unknown): McpRegistryPayload {
  return mcpRegistryPayloadSchema.parse(raw);
}

async function readRegistryFromDisk(cacheFilePath: string): Promise<McpRegistryPayload | null> {
  const text = await fs.readFile(cacheFilePath, 'utf8').catch(() => null);
  if (!text) return null;

  try {
    return parseRegistryPayload(JSON.parse(text));
  } catch (error) {
    log.warn({ event: 'mcp_registry.cache_read_failed', error }, 'failed to read registry cache');
    return null;
  }
}

async function writeRegistryToDisk(
  cacheFilePath: string,
  payload: McpRegistryPayload,
): Promise<void> {
  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getRegistryUrl(): string {
  return process.env['STITCH_MCP_REGISTRY_URL']?.trim() || DEFAULT_MCP_REGISTRY_URL;
}

function normalizeServers(payload: McpRegistryPayload): McpRegistryServer[] {
  return payload.servers.toSorted((a, b) => a.name.localeCompare(b.name));
}

async function fetchRegistryPayload(fetchImpl: FetchLike): Promise<McpRegistryPayload> {
  const response = await fetchImpl(getRegistryUrl(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  return parseRegistryPayload(JSON.parse(text));
}

export async function refreshMcpRegistryCache(
  options: RefreshRegistryOptions = {},
): Promise<ServiceResult<McpRegistryPayload>> {
  const cacheFilePath = options.cacheFilePath ?? PATHS.filePaths.mcpRegistry;
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;

  if (!options.force && inMemoryRegistry) {
    return ok(inMemoryRegistry);
  }

  try {
    const payload = await fetchRegistryPayload(fetchImpl);
    await writeRegistryToDisk(cacheFilePath, payload);
    inMemoryRegistry = payload;
    return ok(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { event: 'mcp_registry.refresh_failed', error: message },
      'failed to refresh MCP registry',
    );
    return err(`Failed to refresh MCP registry: ${message}`, 500);
  }
}

export async function listMcpRegistryServers(
  options: ListRegistryOptions = {},
): Promise<ServiceResult<McpRegistryServer[]>> {
  const cacheFilePath = options.cacheFilePath ?? PATHS.filePaths.mcpRegistry;

  if (inMemoryRegistry) {
    return ok(normalizeServers(inMemoryRegistry));
  }

  const fromDisk = await readRegistryFromDisk(cacheFilePath);
  if (fromDisk) {
    inMemoryRegistry = fromDisk;
    return ok(normalizeServers(fromDisk));
  }

  const refreshed = await refreshMcpRegistryCache({
    cacheFilePath,
    fetchImpl: options.fetchImpl,
    force: true,
  });
  if (isServiceError(refreshed)) {
    return refreshed;
  }

  return ok(normalizeServers(refreshed.data));
}

export function clearMcpRegistryCacheForTests(): void {
  inMemoryRegistry = null;
}
