import { asc, eq } from 'drizzle-orm';

import { createMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpAuthConfig, McpTool, McpTransport } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpServers } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { withMcpClient } from '@/mcp/client.js';

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

  let rawTools: Record<string, unknown>;
  try {
    rawTools = await withMcpClient(server, (client) => client.tools());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`MCP server error: ${message}`, 400);
  }

  // Map SDK tool objects to our lightweight cached shape
  const tools: McpTool[] = Object.entries(rawTools).map(([name, toolDef]) => {
    const def = toolDef as {
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: McpTool['annotations'];
      icons?: McpTool['icons'];
    };
    return {
      name,
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      icons: def.icons,
    };
  });

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

export async function getMcpServersWithCachedTools(): Promise<McpServerWithTools[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      url: mcpServers.url,
      authConfig: mcpServers.authConfig,
      tools: mcpServers.tools,
    })
    .from(mcpServers)
    .orderBy(asc(mcpServers.createdAt));

  return rows;
}
