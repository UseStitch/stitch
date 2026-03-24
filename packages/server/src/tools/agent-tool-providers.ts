import { eq } from 'drizzle-orm';

import type { AgentToolType } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { agents } from '@/db/schema.js';
import type { AgentInfo, AgentToolProvider } from '@/tools/agent-tool-provider-types.js';
import { meetingsToolProvider } from '@/tools/meetings-tool.js';
import type { ToolContext } from '@/tools/wrappers.js';
import type { Tool } from 'ai';

/**
 * All registered agent tool providers.
 * Add new providers here when creating new agent-specific tools.
 */
const providers: AgentToolProvider[] = [meetingsToolProvider];

async function resolveAgent(agentId: PrefixedString<'agt'>): Promise<AgentInfo | null> {
  try {
    const db = getDb();
    const [agent] = await db
      .select({ id: agents.id, name: agents.name, kind: agents.kind })
      .from(agents)
      .where(eq(agents.id, agentId));
    return agent ?? null;
  } catch {
    return null;
  }
}

/**
 * Create agent-specific tools for a given agent.
 * Runs all registered providers whose `appliesTo` matches, merges their tools.
 * Used by stream-runner.ts at runtime.
 */
export async function createAgentSpecificTools(
  agentId: PrefixedString<'agt'>,
  context: ToolContext,
): Promise<Record<string, Tool>> {
  if (providers.length === 0) return {};

  const agent = await resolveAgent(agentId);
  if (!agent) return {};

  const tools: Record<string, Tool> = {};
  for (const provider of providers) {
    if (provider.appliesTo(agent)) {
      const providerTools = provider.createTools(context);
      Object.assign(tools, providerTools);
    }
  }

  return tools;
}

/**
 * Return the known tool name/type pairs for agent-specific tools.
 * Used by routes/agents.ts for the tool-config UI endpoint.
 */
export async function getAgentSpecificKnownTools(
  agentId: PrefixedString<'agt'>,
): Promise<{ toolType: AgentToolType; toolName: string }[]> {
  if (providers.length === 0) return [];

  const agent = await resolveAgent(agentId);
  if (!agent) return [];

  const knownTools: { toolType: AgentToolType; toolName: string }[] = [];
  for (const provider of providers) {
    if (provider.appliesTo(agent)) {
      knownTools.push(...provider.knownTools());
    }
  }

  return knownTools;
}
