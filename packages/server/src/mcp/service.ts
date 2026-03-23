import { asc, eq } from 'drizzle-orm';

import { createMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { agentMcpServers, mcpServers } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { buildAuthHeaders } from '@/mcp/auth.js';

export async function listMcpServers() {
  const db = getDb();
  return db.select().from(mcpServers).orderBy(asc(mcpServers.createdAt));
}

export async function createMcpServer(input: {
  name: string;
  transport: McpTransport;
  url: string;
  authConfig: McpAuthConfig;
}): Promise<ServiceResult<{ id: string }>> {
  const db = getDb();
  const id = createMcpServerId();
  await db.insert(mcpServers).values({
    id,
    name: input.name,
    transport: input.transport,
    url: input.url,
    authConfig: input.authConfig,
  });
  return ok({ id });
}

export async function deleteMcpServer(serverId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!existing) {
    return err('MCP server not found', 404);
  }
  await db.delete(mcpServers).where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  return ok(null);
}

export async function fetchMcpTools(serverId: string): Promise<ServiceResult<McpTool[]>> {
  const db = getDb();
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));
  if (!server) {
    return err('MCP server not found', 404);
  }

  const authHeaders = buildAuthHeaders(server.authConfig);
  const baseHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-03-26',
    ...authHeaders,
  };

  // Initialize session
  const initRes = await fetch(server.url, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'stitch', version: '1.0' },
      },
    }),
  });

  if (!initRes.ok) {
    return err(`MCP server returned ${initRes.status} during initialization`, 400);
  }

  const sessionId = initRes.headers.get('mcp-session-id');
  const sessionHeaders: Record<string, string> = sessionId
    ? { ...baseHeaders, 'Mcp-Session-Id': sessionId }
    : baseHeaders;

  // Fetch tools list
  const toolsRes = await fetch(server.url, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  });

  if (!toolsRes.ok) {
    return err(`MCP server returned ${toolsRes.status} fetching tools`, 400);
  }

  const contentType = toolsRes.headers.get('content-type') ?? '';
  let body: unknown;

  if (contentType.includes('text/event-stream')) {
    const text = await toolsRes.text();
    // Parse the first `data:` line from the SSE stream
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) return err('No data in SSE response from MCP server', 400);
    body = JSON.parse(dataLine.slice(5).trim());
  } else {
    body = await toolsRes.json();
  }

  const rpc = body as { result?: { tools?: McpTool[] }; error?: { message: string } };
  if (rpc.error) {
    return err(rpc.error.message, 400);
  }

  const tools = rpc.result?.tools ?? [];

  // Persist tools to cache
  await db
    .update(mcpServers)
    .set({ tools, updatedAt: Date.now() })
    .where(eq(mcpServers.id, serverId as PrefixedString<'mcp'>));

  return ok(tools);
}

export type McpServerWithTools = {
  id: PrefixedString<'mcp'>;
  name: string;
  url: string;
  authConfig: McpAuthConfig;
  tools: McpTool[] | null;
};

export async function getMcpServersWithCachedToolsForAgent(
  agentId: PrefixedString<'agt'>,
): Promise<McpServerWithTools[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      url: mcpServers.url,
      authConfig: mcpServers.authConfig,
      tools: mcpServers.tools,
    })
    .from(agentMcpServers)
    .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
    .where(eq(agentMcpServers.agentId, agentId));

  return rows;
}
