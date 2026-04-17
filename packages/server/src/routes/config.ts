import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';
import { TOOL_ENABLED_SCOPES } from '@stitch/shared/tools/types';

import { listConnectorDefinitions } from '@/connectors/registry.js';
import { getBrowserKnownTools } from '@/lib/browser/tool-config.js';
import { getMcpServersWithCachedTools } from '@/mcp/service.js';
import { getMcpServerPresentation } from '@/mcp/tool-executor.js';
import { deletePerm, getPerms, upsertPerm } from '@/permission/service.js';
import { getToolEnabledStates, setToolEnabledState } from '@/tools/enabled-service.js';
import { STITCH_KNOWN_TOOLS } from '@/tools/runtime/registry.js';
import { listToolsets } from '@/tools/toolsets/registry.js';

const upsertPermissionSchema = z.object({
  toolName: z.string().min(1),
  pattern: z.string().nullable().optional(),
  permission: z.enum(['allow', 'deny', 'ask']),
});

const upsertToolEnabledSchema = z.object({
  scope: z.enum(TOOL_ENABLED_SCOPES),
  identifier: z.string().min(1),
  enabled: z.boolean(),
});

export const configRouter = new Hono();

type ToolsetSource = 'native' | 'provider' | 'connector' | 'mcp';

const NATIVE_TOOLSET_IDS = new Set(['browser', 'agenda', 'session-history', 'recordings']);

export function getToolsetSource(toolsetId: string): ToolsetSource {
  if (toolsetId.startsWith('mcp:')) return 'mcp';
  if (NATIVE_TOOLSET_IDS.has(toolsetId)) return 'native';

  const connectorDefs = listConnectorDefinitions();
  if (connectorDefs.some((definition) => toolsetId.startsWith(`${definition.id}-`))) {
    return 'connector';
  }

  return 'provider';
}

function humanizeToolName(name: string): string {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

configRouter.get('/tools', async (c) => {
  const mcpServersWithTools = await getMcpServersWithCachedTools();
  const mcpKnownTools = mcpServersWithTools.flatMap((server) =>
    (server.tools ?? []).map((tool) => {
      const presentation = getMcpServerPresentation(server.id);
      const toolPresentation = presentation?.tools[tool.name];
      return {
        toolType: 'mcp' as const,
        toolName: formatMcpToolName(server.id, tool.name),
        displayName: toolPresentation?.title ?? tool.title ?? tool.annotations?.title ?? tool.name,
      };
    }),
  );

  return c.json({ tools: [...STITCH_KNOWN_TOOLS, ...mcpKnownTools, ...getBrowserKnownTools()] });
});

configRouter.get('/mcp-tools', async (c) => {
  const mcpServersWithTools = await getMcpServersWithCachedTools();
  const tools = mcpServersWithTools.flatMap((server) => {
    const presentation = getMcpServerPresentation(server.id);
    const serverName = server.name;

    return (server.tools ?? []).map((tool) => {
      const toolPresentation = presentation?.tools[tool.name];
      return {
        name: formatMcpToolName(server.id, tool.name),
        displayName: toolPresentation?.title ?? tool.title ?? tool.annotations?.title ?? tool.name,
        serverId: server.id,
        serverName,
        serverIconPath: presentation?.iconPath,
        toolIconPath: toolPresentation?.iconPath,
      };
    });
  });

  return c.json({ tools });
});

configRouter.get('/toolsets', async (c) => {
  const toolsets = listToolsets()
    .map((toolset) => ({
      id: toolset.id,
      name: toolset.name,
      description: toolset.description,
      icon: toolset.icon ?? null,
      source: getToolsetSource(toolset.id),
      toolCount: toolset.tools().length,
      hasInstructions: !!toolset.instructions,
      promptCount: toolset.prompts?.length ?? 0,
      tools: toolset.tools().map((tool) => ({
        toolName: tool.name,
        displayName: humanizeToolName(tool.name),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ toolsets });
});

configRouter.get('/tools/enabled', async (c) => {
  const states = await getToolEnabledStates();
  return c.json({ states });
});

configRouter.put('/tools/enabled', zValidator('json', upsertToolEnabledSchema), async (c) => {
  const body = c.req.valid('json');
  await setToolEnabledState({
    scope: body.scope,
    identifier: body.identifier,
    enabled: body.enabled,
  });
  return c.body(null, 204);
});

configRouter.get('/permissions', async (c) => {
  const permissions = await getPerms();
  return c.json(permissions);
});

configRouter.put('/permissions', zValidator('json', upsertPermissionSchema), async (c) => {
  const body = c.req.valid('json');
  await upsertPerm({
    toolName: body.toolName,
    pattern: body.pattern ?? null,
    permission: body.permission,
  });
  return c.body(null, 204);
});

configRouter.delete('/permissions/:permissionId', async (c) => {
  const permissionId = c.req.param('permissionId') as PrefixedString<'perm'>;
  await deletePerm(permissionId);
  return c.body(null, 204);
});
