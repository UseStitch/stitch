import { and, eq } from 'drizzle-orm';

import type { AgentToolType } from '@stitch/shared/agents/types';
import type { AgentToolEntry } from '@stitch/shared/agents/types';
import { createAgentToolId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agentTools } from '@/db/schema.js';

/**
 * Returns the enabled state for every tool in `knownTools` for the given agent.
 * Tools with no row default to enabled (sparse storage — only disabled tools have rows).
 */
export async function getAgentToolConfig(
  agentId: PrefixedString<'agt'>,
  knownTools: { toolType: AgentToolType; toolName: string }[],
): Promise<AgentToolEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentTools)
    .where(eq(agentTools.agentId, agentId));

  const disabledSet = new Set(
    rows
      .filter((r) => !r.enabled)
      .map((r) => `${r.toolType}:${r.toolName}`),
  );

  return knownTools.map((t) => ({
    toolType: t.toolType,
    toolName: t.toolName,
    enabled: !disabledSet.has(`${t.toolType}:${t.toolName}`),
  }));
}

/**
 * Returns the names of stitch tools that have been explicitly disabled for the given agent.
 */
export async function getDisabledToolNames(
  agentId: PrefixedString<'agt'>,
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ toolName: agentTools.toolName })
    .from(agentTools)
    .where(
      and(
        eq(agentTools.agentId, agentId),
        eq(agentTools.toolType, 'stitch'),
        eq(agentTools.enabled, false),
      ),
    );

  return new Set(rows.map((r) => r.toolName));
}

export async function setAgentToolEnabled(
  agentId: PrefixedString<'agt'>,
  toolType: AgentToolType,
  toolName: string,
  enabled: boolean,
): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const [existing] = await db
    .select({ id: agentTools.id })
    .from(agentTools)
    .where(
      and(
        eq(agentTools.agentId, agentId),
        eq(agentTools.toolType, toolType),
        eq(agentTools.toolName, toolName),
      ),
    );

  if (existing) {
    await db
      .update(agentTools)
      .set({ enabled, updatedAt: now })
      .where(eq(agentTools.id, existing.id));
    return;
  }

  // Only write a row when the tool is disabled — sparse storage.
  // If re-enabling a tool that has no row, there's nothing to do.
  if (enabled) return;

  await db.insert(agentTools).values({
    id: createAgentToolId(),
    agentId,
    toolType,
    toolName,
    enabled: false,
    createdAt: now,
    updatedAt: now,
  });
}
