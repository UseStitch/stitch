import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AGENT_TOOL_TYPES, AGENT_TYPES } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';

import {
  addMcpServerToAgent,
  getAgentMcpServers,
  removeMcpServerFromAgent,
} from '@/agents/mcp-config.js';
import { createAgent, deleteAgent, listAgents, updateAgent } from '@/agents/service.js';
import {
  addSubAgentToAgent,
  getAgentSubAgents,
  removeSubAgentFromAgent,
  updateSubAgentConfig,
} from '@/agents/sub-agent-config.js';
import { getAgentToolConfig, setAgentToolEnabled } from '@/agents/tool-config.js';
import { isServiceError } from '@/lib/service-result.js';
import { getMcpServersWithCachedToolsForAgent } from '@/mcp/service.js';
import {
  deleteAgentPermission,
  listAgentPermissions,
  upsertAgentPermission,
} from '@/permission/service.js';
import { getAgentSpecificKnownTools } from '@/tools/agent-tool-providers.js';
import { STITCH_KNOWN_TOOLS } from '@/tools/index.js';

export const agentsRouter = new Hono();

const createAgentSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(AGENT_TYPES).optional().default('primary'),
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
  .refine(
    (value) =>
      value.name !== undefined ||
      value.useBasePrompt !== undefined ||
      value.systemPrompt !== undefined,
    {
      message: 'At least one field is required',
    },
  );

const setToolEnabledSchema = z.object({
  toolType: z.enum(AGENT_TOOL_TYPES),
  toolName: z.string().min(1),
  enabled: z.boolean(),
});

const addMcpServerSchema = z.object({
  mcpServerId: z.templateLiteral(['mcp_', z.string()]),
});

const addSubAgentSchema = z.object({
  subAgentId: z.templateLiteral(['agt_', z.string()]),
});

const updateSubAgentConfigSchema = z.object({
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
});

const upsertPermissionSchema = z.object({
  toolName: z.string().min(1),
  pattern: z.string().nullable().optional(),
  permission: z.enum(['allow', 'deny', 'ask']),
});

agentsRouter.get('/', async (c) => {
  const rows = await listAgents();
  return c.json(rows);
});

agentsRouter.post('/', zValidator('json', createAgentSchema), async (c) => {
  const body = c.req.valid('json');

  const result = await createAgent({
    name: body.name,
    type: body.type,
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
      displayName: t.name,
    })),
  );

  const agentSpecificKnown = await getAgentSpecificKnownTools(agentId);
  const tools = await getAgentToolConfig(agentId, [
    ...STITCH_KNOWN_TOOLS,
    ...mcpKnownTools,
    ...agentSpecificKnown,
  ]);
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

agentsRouter.get('/:id/sub-agents', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const subAgents = await getAgentSubAgents(agentId);
  return c.json(subAgents);
});

agentsRouter.post('/:id/sub-agents', zValidator('json', addSubAgentSchema), async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const body = c.req.valid('json');
  const result = await addSubAgentToAgent(agentId, body.subAgentId as PrefixedString<'agt'>);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});

agentsRouter.delete('/:id/sub-agents/:subAgentId', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const subAgentId = c.req.param('subAgentId') as PrefixedString<'agt'>;
  const result = await removeSubAgentFromAgent(agentId, subAgentId);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});

agentsRouter.patch(
  '/:id/sub-agents/:subAgentId',
  zValidator('json', updateSubAgentConfigSchema),
  async (c) => {
    const agentId = c.req.param('id') as PrefixedString<'agt'>;
    const subAgentId = c.req.param('subAgentId') as PrefixedString<'agt'>;
    const body = c.req.valid('json');
    const result = await updateSubAgentConfig(agentId, subAgentId, {
      providerId: body.providerId,
      modelId: body.modelId,
    });
    if (isServiceError(result)) {
      return c.json({ error: result.error }, result.status);
    }
    return c.body(null, 204);
  },
);

agentsRouter.get('/:id/permissions', async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const permissions = await listAgentPermissions(agentId);
  return c.json(permissions);
});

agentsRouter.put('/:id/permissions', zValidator('json', upsertPermissionSchema), async (c) => {
  const agentId = c.req.param('id') as PrefixedString<'agt'>;
  const body = c.req.valid('json');
  await upsertAgentPermission({
    agentId,
    toolName: body.toolName,
    pattern: body.pattern ?? null,
    permission: body.permission,
  });
  return c.body(null, 204);
});

agentsRouter.delete('/:id/permissions/:permissionId', async (c) => {
  const permissionId = c.req.param('permissionId') as PrefixedString<'perm'>;
  await deleteAgentPermission(permissionId);
  return c.body(null, 204);
});
