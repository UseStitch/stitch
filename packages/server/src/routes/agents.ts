import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AGENT_TOOL_TYPES } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';

import { createAgent, deleteAgent, listAgents, updateAgent } from '@/agents/service.js';
import { getAgentToolConfig, setAgentToolEnabled } from '@/agents/tool-config.js';
import {
  addMcpServerToAgent,
  getAgentMcpServers,
  removeMcpServerFromAgent,
} from '@/agents/mcp-config.js';
import { getMcpServersWithCachedToolsForAgent } from '@/mcp/service.js';
import { isServiceError } from '@/lib/service-result.js';
import { createTools } from '@/tools/index.js';

const STITCH_KNOWN_TOOLS = (Object.keys(createTools({ sessionId: 'ses_' as PrefixedString<'ses'>, messageId: 'msg_' as PrefixedString<'msg'>, agentId: 'agt_' as PrefixedString<'agt'>, streamRunId: '' })) as string[]).map((name) => ({ toolType: 'stitch' as const, toolName: name }));

export const agentsRouter = new Hono();

const createAgentSchema = z
  .object({
    name: z.string().trim().min(1),
    useBasePrompt: z.boolean().optional().default(true),
    systemPrompt: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      value.useBasePrompt ||
      (typeof value.systemPrompt === 'string' && value.systemPrompt.trim().length > 0),
    {
      message: 'systemPrompt is required when useBasePrompt is false',
      path: ['systemPrompt'],
    },
  );

const updateAgentSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    useBasePrompt: z.boolean().optional(),
    systemPrompt: z.string().nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.useBasePrompt !== undefined || value.systemPrompt !== undefined, {
    message: 'At least one field is required',
  });

const setToolEnabledSchema = z.object({
  toolType: z.enum(AGENT_TOOL_TYPES),
  toolName: z.string().min(1),
  enabled: z.boolean(),
});

const addMcpServerSchema = z.object({
  mcpServerId: z.string().min(1),
});

agentsRouter.get('/', async (c) => {
  const rows = await listAgents();
  return c.json(rows);
});

agentsRouter.post('/', zValidator('json', createAgentSchema), async (c) => {
  const body = c.req.valid('json');

  const result = await createAgent({
    name: body.name,
    useBasePrompt: body.useBasePrompt,
    systemPrompt: body.systemPrompt ?? null,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 201);
});

agentsRouter.put('/:id', zValidator('json', updateAgentSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const result = await updateAgent(id, {
    name: body.name,
    useBasePrompt: body.useBasePrompt,
    systemPrompt: body.systemPrompt,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

agentsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteAgent(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});

agentsRouter.get('/:id/tool-config', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;

  const mcpServersWithTools = await getMcpServersWithCachedToolsForAgent(agentId);
  const mcpKnownTools = mcpServersWithTools.flatMap((s) =>
    (s.tools ?? []).map((t) => ({
      toolType: 'mcp' as const,
      toolName: formatMcpToolName(s.id, t.name),
    })),
  );

  const tools = await getAgentToolConfig(agentId, [...STITCH_KNOWN_TOOLS, ...mcpKnownTools]);
  return c.json({ tools });
});

agentsRouter.put('/:id/tool-config', zValidator('json', setToolEnabledSchema), async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const body = c.req.valid('json');
  await setAgentToolEnabled(agentId, body.toolType, body.toolName, body.enabled);
  return c.body(null, 204);
});

agentsRouter.get('/:id/mcp-servers', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const servers = await getAgentMcpServers(agentId);
  return c.json(servers);
});

agentsRouter.post('/:id/mcp-servers', zValidator('json', addMcpServerSchema), async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const body = c.req.valid('json');
  const result = await addMcpServerToAgent(agentId, body.mcpServerId as PrefixedString<'mcp'>);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});

agentsRouter.delete('/:id/mcp-servers/:mcpServerId', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const mcpServerId = c.req.param('mcpServerId') as PrefixedString<'mcp'>;
  const result = await removeMcpServerFromAgent(agentId, mcpServerId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});
