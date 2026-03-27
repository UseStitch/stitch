import { and, eq } from 'drizzle-orm';

import type { Agent } from '@stitch/shared/agents/types';
import { createAgentSubAgentId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agentSubAgents, agents } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

export type SubAgentWithConfig = Agent & {
  providerId: string | null;
  modelId: string | null;
};

export async function getAgentSubAgents(
  agentId: PrefixedString<'agt'>,
): Promise<SubAgentWithConfig[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      type: agents.type,
      kind: agents.kind,
      isDeletable: agents.isDeletable,
      systemPrompt: agents.systemPrompt,
      useBasePrompt: agents.useBasePrompt,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      providerId: agentSubAgents.providerId,
      modelId: agentSubAgents.modelId,
    })
    .from(agentSubAgents)
    .innerJoin(agents, eq(agentSubAgents.subAgentId, agents.id))
    .where(eq(agentSubAgents.agentId, agentId));

  return rows;
}

export async function addSubAgentToAgent(
  agentId: PrefixedString<'agt'>,
  subAgentId: PrefixedString<'agt'>,
): Promise<ServiceResult<null>> {
  const db = getDb();

  if (agentId === subAgentId) {
    return err('An agent cannot be a sub-agent of itself', 400);
  }

  const [parentAgent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!parentAgent) {
    return err('Parent agent not found', 404);
  }
  if (parentAgent.type !== 'primary') {
    return err('Only primary agents can have sub-agents', 400);
  }

  const [subAgent] = await db.select().from(agents).where(eq(agents.id, subAgentId));
  if (!subAgent) {
    return err('Sub-agent not found', 404);
  }
  if (subAgent.type !== 'sub') {
    return err('Only agents of type "sub" can be assigned as sub-agents', 400);
  }

  const [alreadyLinked] = await db
    .select({ id: agentSubAgents.id })
    .from(agentSubAgents)
    .where(and(eq(agentSubAgents.agentId, agentId), eq(agentSubAgents.subAgentId, subAgentId)));
  if (alreadyLinked) {
    return err('Sub-agent already assigned to this agent', 400);
  }

  const now = Date.now();
  await db.insert(agentSubAgents).values({
    id: createAgentSubAgentId(),
    agentId,
    subAgentId,
    createdAt: now,
    updatedAt: now,
  });

  return ok(null);
}

export async function updateSubAgentConfig(
  agentId: PrefixedString<'agt'>,
  subAgentId: PrefixedString<'agt'>,
  config: { providerId: string | null; modelId: string | null },
): Promise<ServiceResult<null>> {
  const db = getDb();

  const [existing] = await db
    .select({ id: agentSubAgents.id })
    .from(agentSubAgents)
    .where(and(eq(agentSubAgents.agentId, agentId), eq(agentSubAgents.subAgentId, subAgentId)));
  if (!existing) {
    return err('Sub-agent not linked to this agent', 404);
  }

  await db
    .update(agentSubAgents)
    .set({
      providerId: config.providerId,
      modelId: config.modelId,
      updatedAt: Date.now(),
    })
    .where(eq(agentSubAgents.id, existing.id));

  return ok(null);
}

export async function removeSubAgentFromAgent(
  agentId: PrefixedString<'agt'>,
  subAgentId: PrefixedString<'agt'>,
): Promise<ServiceResult<null>> {
  const db = getDb();

  const [existing] = await db
    .select({ id: agentSubAgents.id })
    .from(agentSubAgents)
    .where(and(eq(agentSubAgents.agentId, agentId), eq(agentSubAgents.subAgentId, subAgentId)));
  if (!existing) {
    return err('Sub-agent not linked to this agent', 404);
  }

  await db.delete(agentSubAgents).where(eq(agentSubAgents.id, existing.id));

  return ok(null);
}
