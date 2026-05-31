import type { McpIcon, McpRegistryServer } from '@stitch/shared/mcp/types';

import { cacheMcpIcon } from '@/mcp/icons.js';
import type { McpServerWithTools } from '@/mcp/service.js';

export type McpServerLiveInfo = {
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  icons?: McpIcon[];
};

type McpToolPresentation = {
  title?: string;
  iconPath?: string;
};

export type McpServerPresentation = {
  serverId: string;
  name: string;
  title?: string;
  description?: string;
  instructions?: string;
  iconPath?: string;
  tools: Record<string, McpToolPresentation>;
};

function pickDisplayIcon(icons?: McpIcon[]): McpIcon | undefined {
  if (!icons || icons.length === 0) return undefined;
  return icons[0];
}

async function resolveIconPath(input: {
  server: McpServerWithTools;
  scope: string;
  icons?: McpIcon[];
}): Promise<string | undefined> {
  const icon = pickDisplayIcon(input.icons);
  if (!icon) return undefined;
  const cached = await cacheMcpIcon({
    serverUrl: input.server.url,
    scope: input.scope,
    icon,
  });
  if (!cached) return undefined;
  return `/mcp/icons/${cached.key}`;
}

export async function buildServerPresentation(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
  registryServer?: McpRegistryServer | null,
): Promise<McpServerPresentation> {
  const tools = server.tools ?? [];
  const toolPresentations = await Promise.all(
    tools.map(async (tool) => {
      const iconPath = await resolveIconPath({
        server,
        scope: `tool:${server.id}:${tool.name}`,
        icons: tool.icons,
      });

      return [
        tool.name,
        {
          title: tool.title ?? tool.annotations?.title,
          iconPath,
        },
      ] as const;
    }),
  );

  const iconPath = await resolveIconPath({
    server,
    scope: `server:${server.id}`,
    icons: liveInfo?.icons,
  });
  const registryIconPath = registryServer?.logoUrl ? `/mcp/${server.id}/logo` : undefined;

  return {
    serverId: server.id,
    name: registryServer?.name ?? server.name ?? liveInfo?.name,
    title: registryServer?.name ?? liveInfo?.title,
    description: liveInfo?.description ?? registryServer?.description,
    instructions: liveInfo?.instructions,
    iconPath: iconPath ?? registryIconPath,
    tools: Object.fromEntries(toolPresentations),
  };
}
