import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { dynamicTool, jsonSchema } from 'ai';

import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig } from '@stitch/shared/mcp/types';

import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { buildAuthHeaders } from '@/mcp/auth.js';
import { McpOAuthProvider, setMcpAuthStatus } from '@/mcp/oauth-provider.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { JSONSchema7 } from 'ai';
import type { Tool } from 'ai';

const log = Log.create({ service: 'mcp-client' });

type McpClient = Client;

type McpServerRef = { id: PrefixedString<'mcp'>; name: string; url: string; authConfig: McpAuthConfig };

/**
 * Module-level cache: one live MCP client per server ID.
 * Clients live for the process lifetime. If a client dies (transport error),
 * it is evicted so the next call reconnects.
 */
const clientCache = new Map<string, Promise<McpClient>>();

/**
 * Transports for in-flight OAuth flows, keyed by server ID. `finishAuth` must
 * run on the same transport instance that began the flow (it holds the
 * in-memory PKCE/code-verifier linkage); a fresh transport would re-trigger
 * discovery and break the exchange.
 */
const pendingOAuthTransports = new Map<string, StreamableHTTPClientTransport>();

export function registerPendingOAuthTransport(serverId: string, transport: StreamableHTTPClientTransport): void {
  pendingOAuthTransports.set(serverId, transport);
}

export function getPendingOAuthTransport(serverId: string): StreamableHTTPClientTransport | undefined {
  return pendingOAuthTransports.get(serverId);
}

export function clearPendingOAuthTransport(serverId: string): void {
  pendingOAuthTransports.delete(serverId);
}

function buildTransport(server: McpServerRef): StreamableHTTPClientTransport {
  if (server.authConfig.type === 'oauth') {
    const authProvider = new McpOAuthProvider({ id: server.id, url: server.url, authConfig: server.authConfig });
    return new StreamableHTTPClientTransport(new URL(server.url), { authProvider });
  }

  const headers = buildAuthHeaders(server.authConfig);
  return new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } });
}

function createAiTool(server: McpServerRef, tool: McpTool): Tool {
  return dynamicTool({
    title: tool.title,
    description: tool.description,
    inputSchema: jsonSchema(tool.inputSchema as JSONSchema7),
    execute: (input) =>
      withMcpClient(server, (client) =>
        client.callTool({
          name: tool.name,
          arguments: input && typeof input === 'object' ? (input as Record<string, unknown>) : {},
        }),
      ),
  });
}

export async function listMcpAiTools(server: McpServerRef): Promise<Record<string, Tool>> {
  const result = await withMcpClient(server, (client) => client.listTools());
  return Object.fromEntries(result.tools.map((tool) => [tool.name, createAiTool(server, tool)]));
}

async function openClient(server: McpServerRef): Promise<McpClient> {
  const transport = buildTransport(server);
  const client = new Client(
    { name: 'stitch', version: '1.0.0' },
    {
      listChanged: {
        tools: {
          onChanged: (error, tools) => {
            if (error) {
              log.warn(
                { error, serverId: server.id, serverName: server.name },
                'failed to handle MCP tools changed notification',
              );
              return;
            }

            internalBus.emit('mcp.tools.list_changed', {
              serverId: server.id,
              serverName: server.name,
              toolCount: tools?.length ?? null,
            });
          },
        },
      },
    },
  );
  client.onclose = () => {
    clientCache.delete(server.id);
  };
  client.onerror = (error) => {
    log.warn({ error, serverId: server.id, serverName: server.name }, 'MCP client error');
  };

  return client
    .connect(transport)
    .then(() => client)
    .catch((err) => {
      // Evict on connection failure so next call retries
      clientCache.delete(server.id);
      throw err;
    });
}

/** Get (or create) a cached MCP client for a server. */
export function getMcpClient(server: McpServerRef): Promise<McpClient> {
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
  const cached = clientCache.get(serverId);
  clientCache.delete(serverId);
  void cached?.then((client) => client.close()).catch(() => undefined);
}

/**
 * Call a function with a cached client, evicting the cache entry on failure
 * so the next call reconnects cleanly.
 */
export async function withMcpClient<T>(server: McpServerRef, fn: (client: McpClient) => Promise<T>): Promise<T> {
  const client = await getMcpClient(server);
  try {
    return await fn(client);
  } catch (err) {
    clientCache.delete(server.id);
    if (server.authConfig.type === 'oauth' && isUnauthorizedError(err)) {
      await setMcpAuthStatus(server.id, 'reauthorization_required');
    }
    throw err;
  }
}

function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('unauthorized') || message.includes('401');
}
