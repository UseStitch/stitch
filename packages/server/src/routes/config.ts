import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';
import { TOOL_ENABLED_SCOPES } from '@stitch/shared/tools/types';

import { getMcpServersWithCachedTools } from '@/mcp/service.js';
import { getMcpServerPresentation } from '@/mcp/tool-executor.js';
import { deletePerm, getPerms, upsertPerm } from '@/permission/service.js';
import { listKnownTools } from '@/tools/catalog.js';
import { getToolEnabledStates, setToolEnabledState } from '@/tools/enabled-service.js';
import { listToolsets } from '@/tools/toolsets/registry.js';
import type { ToolsetKind } from '@/tools/toolsets/types.js';
import { toToolsetView } from '@/tools/toolsets/view.js';

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

export function getToolsetSource(toolset: { kind: ToolsetKind }): ToolsetKind {
  return toolset.kind;
}

configRouter.get('/tools', (c) => {
  return c.json({ tools: listKnownTools() });
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
    .map((toolset) => {
      const view = toToolsetView(toolset, {
        active: false,
        persisted: false,
        includeTools: true,
      });
      return {
        id: view.id,
        name: view.name,
        description: view.description,
        icon: view.icon,
        source: getToolsetSource(toolset),
        toolCount: view.tools?.length ?? 0,
        hasInstructions: view.hasInstructions,
        promptCount: view.promptCount,
        tools: (view.tools ?? []).map((tool) => ({
          toolName: tool.name,
          displayName: tool.displayName,
        })),
      };
    })
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
