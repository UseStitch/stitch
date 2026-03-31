import { createMCPClient } from '@ai-sdk/mcp';

import type { McpAuthConfig } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { buildAuthHeaders } from '@/mcp/auth.js';
import type { MCPClient } from '@ai-sdk/mcp';

const log = Log.create({ service: 'mcp-client' });

type McpServerRef = {
  id: string;
  name: string;
  url: string;
  authConfig: McpAuthConfig;
};

/**
 * Module-level cache: one live MCP client per server ID.
 * Clients live for the process lifetime. If a client dies (transport error),
 * it is evicted so the next call reconnects.
 */
const clientCache = new Map<string, Promise<MCPClient>>();

function openClient(server: McpServerRef): Promise<MCPClient> {
  const headers = buildAuthHeaders(server.authConfig);

  return createMCPClient({
    transport: {
      type: 'http',
      url: server.url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    },
  }).catch((err) => {
    // Evict on connection failure so next call retries
    clientCache.delete(server.id);
    throw err;
  });
}

/** Get (or create) a cached MCP client for a server. */
export function getMcpClient(server: McpServerRef): Promise<MCPClient> {
  const cached = clientCache.get(server.id);
  if (cached) return cached;

  log.info(
    { event: 'mcp.client.connecting', serverId: server.id, serverName: server.name },
    'opening MCP client connection',
  );

  const promise = openClient(server);
  clientCache.set(server.id, promise);
  return promise;
}

/** Evict a cached client, forcing reconnect on next use. */
export function evictMcpClient(serverId: string): void {
  clientCache.delete(serverId);
}

/**
 * Call a function with a cached client, evicting the cache entry on failure
 * so the next call reconnects cleanly.
 */
export async function withMcpClient<T>(
  server: McpServerRef,
  fn: (client: MCPClient) => Promise<T>,
): Promise<T> {
  const client = await getMcpClient(server);
  try {
    return await fn(client);
  } catch (err) {
    clientCache.delete(server.id);
    throw err;
  }
}
