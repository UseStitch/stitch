import { createMCPClient } from '@ai-sdk/mcp';

import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { buildAuthHeaders } from '@/mcp/auth.js';
import { getMcpServersWithCachedToolsForAgent } from '@/mcp/service.js';
import type { McpServerWithTools } from '@/mcp/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withPermissionGate } from '@/tools/runtime/wrappers.js';
import type { MCPClient } from '@ai-sdk/mcp';
import type { Tool } from 'ai';

const log = Log.create({ service: 'mcp-tool-executor' });

// Module-level cache: one live MCP client per server ID, keyed by server ID.
// Clients are never closed between requests — they live for the process lifetime.
// If a client dies (transport error), we evict it and reconnect on next use.
const clientCache = new Map<string, Promise<MCPClient>>();

function openClient(server: McpServerWithTools): Promise<MCPClient> {
  const headers = buildAuthHeaders(server.authConfig);

  const promise = createMCPClient({
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

  return promise;
}

function getClient(server: McpServerWithTools): Promise<MCPClient> {
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

/** Call when an MCP server is deleted or its auth changes, to force reconnect. */
export function evictMcpClient(serverId: string): void {
  clientCache.delete(serverId);
}

async function getToolsForServer(
  server: McpServerWithTools,
  context: ToolContext,
): Promise<Record<string, Tool>> {
  let client: MCPClient;
  client = await getClient(server);

  let rawTools: Record<string, Tool>;
  try {
    rawTools = (await client.tools()) as Record<string, Tool>;
  } catch (err) {
    // Client may be in a bad state — evict so next call reconnects
    clientCache.delete(server.id);
    throw err;
  }

  const prefixed: Record<string, Tool> = {};
  for (const [toolName, toolDef] of Object.entries(rawTools)) {
    const prefixedName = formatMcpToolName(server.id, toolName);
    prefixed[prefixedName] = withPermissionGate(
      prefixedName,
      { getPatternTargets: () => [], getSuggestion: () => null },
      toolDef,
      context,
    );
  }
  return prefixed;
}

export async function createMcpToolsForAgent(
  agentId: PrefixedString<'agt'>,
  context: ToolContext,
): Promise<Record<string, Tool>> {
  const servers = await getMcpServersWithCachedToolsForAgent(agentId);

  log.info(
    {
      event: 'mcp.tools.loading',
      agentId,
      serverCount: servers.length,
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        cachedToolCount: s.tools?.length ?? 0,
      })),
    },
    'loading MCP tools for agent',
  );

  if (servers.length === 0) return {};

  const results = await Promise.allSettled(
    servers.map((server) => {
      log.info(
        { event: 'mcp.tools.fetching', serverId: server.id, serverName: server.name },
        'fetching tools from MCP server',
      );
      return getToolsForServer(server, context);
    }),
  );

  const merged: Record<string, Tool> = {};
  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      const keys = Object.keys(result.value);
      log.info(
        {
          event: 'mcp.tools.loaded',
          serverId: servers[i]?.id,
          toolCount: keys.length,
          toolNames: keys,
        },
        'MCP tools loaded for server',
      );
      Object.assign(merged, result.value);
    } else {
      log.error(
        { event: 'mcp.tools.load_failed', serverId: servers[i]?.id },
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    }
  }

  log.info(
    {
      event: 'mcp.tools.ready',
      agentId,
      totalToolCount: Object.keys(merged).length,
      toolNames: Object.keys(merged),
    },
    'MCP tools ready for agent',
  );

  return merged;
}
