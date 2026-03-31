import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import { formatMcpToolName } from '@stitch/shared/mcp/types';

import { getMcpServersWithCachedTools } from '@/mcp/service.js';
import { getMcpServerPresentation } from '@/mcp/tool-executor.js';
import { deletePerm, getPerms, upsertPerm } from '@/permission/service.js';
import { getGlobalProviderKnownTools } from '@/tools/providers/index.js';
import { STITCH_KNOWN_TOOLS } from '@/tools/runtime/registry.js';

const upsertPermissionSchema = z.object({
  toolName: z.string().min(1),
  pattern: z.string().nullable().optional(),
  permission: z.enum(['allow', 'deny', 'ask']),
});

export const configRouter = new Hono();

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

  const providerTools = await getGlobalProviderKnownTools();
  return c.json({ tools: [...STITCH_KNOWN_TOOLS, ...mcpKnownTools, ...providerTools] });
});

configRouter.get('/mcp-tools', async (c) => {
  const mcpServersWithTools = await getMcpServersWithCachedTools();
  const tools = mcpServersWithTools.flatMap((server) => {
    const presentation = getMcpServerPresentation(server.id);
    const serverName = presentation?.title ?? presentation?.name ?? server.name;

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
