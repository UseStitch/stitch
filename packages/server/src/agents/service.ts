import { asc, eq } from 'drizzle-orm';

import type { AgentType } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';
import { createAgentId } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agents } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

function validatePromptConfig(input: {
  useBasePrompt: boolean;
  systemPrompt: string | null;
}): ServiceResult<null> {
  if (input.useBasePrompt) {
    return ok(null);
  }

  if (!input.systemPrompt || input.systemPrompt.trim().length === 0) {
    return err('systemPrompt is required when useBasePrompt is false', 400);
  }

  return ok(null);
}

export async function listAgents() {
  const db = getDb();
  return db.select().from(agents).orderBy(asc(agents.createdAt));
}

export async function createAgent(input: {
  name: string;
  type: AgentType;
  useBasePrompt: boolean;
  systemPrompt: string | null;
}): Promise<ServiceResult<{ id: PrefixedString<'agt'> }>> {
  const promptValidation = validatePromptConfig({
    useBasePrompt: input.useBasePrompt,
    systemPrompt: input.systemPrompt,
  });
  if ('error' in promptValidation) {
    return promptValidation;
  }

  const db = getDb();
  const id = createAgentId();
  await db.insert(agents).values({
    id,
    name: input.name,
    type: input.type,
    useBasePrompt: input.useBasePrompt,
    systemPrompt: input.systemPrompt,
  });

  return ok({ id });
}

export async function updateAgent(
  agentId: string,
  input: {
    name?: string;
    useBasePrompt?: boolean;
    systemPrompt?: string | null;
  },
): Promise<ServiceResult<null>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId as PrefixedString<'agt'>));
  if (!existing) {
    return err('Agent not found', 404);
  }

  const updates: {
    name?: string;
    useBasePrompt?: boolean;
    systemPrompt?: string | null;
    updatedAt: number;
  } = { updatedAt: Date.now() };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.useBasePrompt !== undefined) {
    updates.useBasePrompt = input.useBasePrompt;
  }

  if (input.systemPrompt !== undefined) {
    updates.systemPrompt = input.systemPrompt;
  }

  const nextUseBasePrompt = updates.useBasePrompt ?? existing.useBasePrompt;
  const nextSystemPrompt =
    updates.systemPrompt !== undefined ? updates.systemPrompt : existing.systemPrompt;

  const promptValidation = validatePromptConfig({
    useBasePrompt: nextUseBasePrompt,
    systemPrompt: nextSystemPrompt,
  });
  if ('error' in promptValidation) {
    return promptValidation;
  }

  await db
    .update(agents)
    .set(updates)
    .where(eq(agents.id, agentId as PrefixedString<'agt'>));

  return ok(null);
}

export async function deleteAgent(agentId: string): Promise<ServiceResult<null>> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId as PrefixedString<'agt'>));
  if (!existing) {
    return err('Agent not found', 404);
  }

  if (!existing.isDeletable) {
    return err('Agent cannot be deleted', 400);
  }

  const primaryAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.type, 'primary'));
  if (existing.type === 'primary' && primaryAgents.length <= 1) {
    return err('At least one primary agent is required', 400);
  }

  await db.delete(agents).where(eq(agents.id, agentId as PrefixedString<'agt'>));
  return ok(null);
}
