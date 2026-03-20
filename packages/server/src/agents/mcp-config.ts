import { and, eq } from 'drizzle-orm';

import { createAgentMcpServerId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { McpServer } from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { agentMcpServers, mcpServers } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { fetchMcpTools } from '@/mcp/service.js';

export async function getAgentMcpServers(
  agentId: PrefixedString<'agt'>,
): Promise<McpServer[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      transport: mcpServers.transport,
      url: mcpServers.url,
      authConfig: mcpServers.authConfig,
      createdAt: mcpServers.createdAt,
      updatedAt: mcpServers.updatedAt,
    })
    .from(agentMcpServers)
    .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
    .where(eq(agentMcpServers.agentId, agentId));

  return rows;
}

export async function addMcpServerToAgent(
  agentId: PrefixedString<'agt'>,
  mcpServerId: PrefixedString<'mcp'>,
): Promise<ServiceResult<null>> {
  const db = getDb();

  const [existing] = await db
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, mcpServerId));
  if (!existing) {
    return err('MCP server not found', 404);
  }

  const [alreadyLinked] = await db
    .select({ id: agentMcpServers.id })
    .from(agentMcpServers)
    .where(
      and(
        eq(agentMcpServers.agentId, agentId),
        eq(agentMcpServers.mcpServerId, mcpServerId),
      ),
    );
  if (alreadyLinked) {
    return err('MCP server already added to agent', 400);
  }

  const now = Date.now();
  await db.insert(agentMcpServers).values({
    id: createAgentMcpServerId(),
    agentId,
    mcpServerId,
    createdAt: now,
    updatedAt: now,
  });

  // Populate the tools cache so they appear immediately in the agent's tool config.
  const [server] = await db
    .select({ tools: mcpServers.tools })
    .from(mcpServers)
    .where(eq(mcpServers.id, mcpServerId));

  if (server && !server.tools) {
    // Best-effort — failure doesn't block the association
    await fetchMcpTools(mcpServerId).catch(() => undefined);
  }

  return ok(null);
}

export async function removeMcpServerFromAgent(
  agentId: PrefixedString<'agt'>,
  mcpServerId: PrefixedString<'mcp'>,
): Promise<ServiceResult<null>> {
  const db = getDb();

  const [existing] = await db
    .select({ id: agentMcpServers.id })
    .from(agentMcpServers)
    .where(
      and(
        eq(agentMcpServers.agentId, agentId),
        eq(agentMcpServers.mcpServerId, mcpServerId),
      ),
    );
  if (!existing) {
    return err('MCP server not linked to agent', 404);
  }

  await db
    .delete(agentMcpServers)
    .where(eq(agentMcpServers.id, existing.id));

  return ok(null);
}
