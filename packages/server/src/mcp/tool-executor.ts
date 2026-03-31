import { formatMcpToolName } from '@stitch/shared/mcp/types';
import type { McpIcon } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';
import { buildAuthHeaders } from '@/mcp/auth.js';
import { getMcpClient, withMcpClient } from '@/mcp/client.js';
import { cacheMcpIcon } from '@/mcp/icons.js';
import { fetchMcpTools, getMcpServersWithCachedTools } from '@/mcp/service.js';
import type { McpServerWithTools } from '@/mcp/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withPermissionGate } from '@/tools/runtime/wrappers.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset, ToolsetPrompt } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

export { evictMcpClient } from '@/mcp/client.js';

const log = Log.create({ service: 'mcp-tool-executor' });

type McpToolPresentation = {
  title?: string;
  iconPath?: string;
};

type McpServerPresentation = {
  serverId: string;
  name: string;
  title?: string;
  description?: string;
  instructions?: string;
  iconPath?: string;
  tools: Record<string, McpToolPresentation>;
};

const serverPresentationById = new Map<string, McpServerPresentation>();
let refreshInFlight: Promise<void> | null = null;

async function getToolsForServer(
  server: McpServerWithTools,
  context: ToolContext,
): Promise<Record<string, Tool>> {
  const rawTools = await withMcpClient(server, (client) =>
    client.tools() as Promise<Record<string, Tool>>,
  );

  const prefixed: Record<string, Tool> = {};
  for (const [toolName, toolDef] of Object.entries(rawTools)) {
    const prefixedName = formatMcpToolName(server.id, toolName);
    prefixed[prefixedName] = withPermissionGate(
      prefixedName,
      { getPatternTargets: () => [], getSuggestion: () => null },
      toolDef,
      context,
    );
  }
  return prefixed;
}

type McpServerLiveInfo = {
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  icons?: McpIcon[];
};

async function fetchServerInfo(server: McpServerWithTools): Promise<McpServerLiveInfo | null> {
  try {
    const authHeaders = buildAuthHeaders(server.authConfig);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26',
      ...authHeaders,
    };

    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'stitch', version: '1.0' },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    let body: unknown;
    if (contentType.includes('text/event-stream')) {
      const dataLine = text.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) return null;
      body = JSON.parse(dataLine.slice(5).trim());
    } else {
      body = JSON.parse(text);
    }

    const rpc = body as {
      result?: {
        serverInfo?: {
          name?: string;
          title?: string;
          description?: string;
          icons?: McpIcon[];
        };
        instructions?: string;
      };
    };

    const serverInfo = rpc.result?.serverInfo;
    const instructions = rpc.result?.instructions;
    if (!serverInfo && !instructions) return null;

    return {
      name: serverInfo?.name ?? undefined,
      title: serverInfo?.title ?? undefined,
      description: serverInfo?.description ?? undefined,
      icons: serverInfo?.icons,
      instructions: instructions ?? undefined,
    };
  } catch {
    return null;
  }
}

async function fetchServerPrompts(server: McpServerWithTools): Promise<ToolsetPrompt[]> {
  try {
    const client = await getMcpClient(server);
    const result = await client.experimental_listPrompts();
    return (result.prompts ?? []).map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments?.map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
    }));
  } catch {
    return [];
  }
}

function buildMcpToolsetId(server: McpServerWithTools): string {
  return `mcp:${server.id}`;
}

function buildToolsetDescription(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
): string {
  if (liveInfo?.description) {
    return liveInfo.description;
  }

  const toolCount = server.tools?.length ?? 0;
  return `MCP server "${server.name}" - provides ${toolCount} tool(s).`;
}

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

function createMcpToolset(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
  prompts: ToolsetPrompt[],
): Toolset {
  const toolsetId = buildMcpToolsetId(server);
  const cachedTools = server.tools ?? [];
  const displayName = liveInfo?.title ?? liveInfo?.name ?? server.name;
  const description = buildToolsetDescription(server, liveInfo);

  return {
    id: toolsetId,
    name: displayName,
    description,
    instructions: liveInfo?.instructions ?? undefined,
    prompts: prompts.length > 0 ? prompts : undefined,
    tools: () =>
      cachedTools.map((tool) => ({
        name: formatMcpToolName(server.id, tool.name),
        description: tool.description ?? `Tool from MCP server "${displayName}"`,
      })),
    activate: (context) => getToolsForServer(server, context),
  };
}

async function buildServerPresentation(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
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

  return {
    serverId: server.id,
    name: liveInfo?.name ?? server.name,
    title: liveInfo?.title,
    description: liveInfo?.description,
    instructions: liveInfo?.instructions,
    iconPath,
    tools: Object.fromEntries(toolPresentations),
  };
}

async function refreshMcpToolsetsInternal(options?: {
  serverIds?: string[];
  refreshTools?: boolean;
}): Promise<void> {
  const refreshTools = options?.refreshTools ?? true;
  const configuredServers = await getMcpServersWithCachedTools();
  const serverIdSet = options?.serverIds ? new Set(options.serverIds) : null;
  const serversToRefresh = serverIdSet
    ? configuredServers.filter((server) => serverIdSet.has(server.id))
    : configuredServers;

  const desiredMcpToolsetIds = new Set(configuredServers.map((server) => buildMcpToolsetId(server)));
  const staleIds = listToolsetIds().filter(
    (id) => id.startsWith('mcp:') && !desiredMcpToolsetIds.has(id),
  );
  for (const staleId of staleIds) {
    unregisterToolset(staleId);
  }

  for (const [serverId] of serverPresentationById.entries()) {
    if (!desiredMcpToolsetIds.has(`mcp:${serverId}`)) {
      serverPresentationById.delete(serverId);
    }
  }

  if (serversToRefresh.length === 0) {
    log.info(
      {
        event: 'mcp.toolsets.refreshed',
        count: 0,
        staleRemovedCount: staleIds.length,
      },
      'no MCP servers configured',
    );
    return;
  }

  const serverSnapshots = await Promise.all(
    serversToRefresh.map(async (server) => {
      const tools = refreshTools
        ? await fetchMcpTools(server.id)
            .then((result) => (isServiceError(result) ? (server.tools ?? []) : result.data))
            .catch(() => server.tools ?? [])
        : (server.tools ?? []);
      return {
        ...server,
        tools,
      } satisfies McpServerWithTools;
    }),
  );

  const infoResults = await Promise.allSettled(serverSnapshots.map(fetchServerInfo));
  const promptResults = await Promise.allSettled(serverSnapshots.map(fetchServerPrompts));

  const registeredIds: string[] = [];
  for (const [index, server] of serverSnapshots.entries()) {
    const liveInfo = infoResults[index]?.status === 'fulfilled' ? infoResults[index].value : null;
    const prompts = promptResults[index]?.status === 'fulfilled' ? promptResults[index].value : [];

    if (liveInfo) {
      log.info(
        {
          event: 'mcp.server_info.fetched',
          serverId: server.id,
          serverName: server.name,
          liveName: liveInfo.name,
          liveTitle: liveInfo.title,
          hasDescription: !!liveInfo.description,
          hasInstructions: !!liveInfo.instructions,
          promptCount: prompts.length,
        },
        'fetched live server info from MCP server',
      );
    }

    const toolset = createMcpToolset(server, liveInfo, prompts);
    registerToolset(toolset);
    registeredIds.push(toolset.id);

    const presentation = await buildServerPresentation(server, liveInfo);
    serverPresentationById.set(server.id, presentation);
  }

  log.info(
    {
      event: 'mcp.toolsets.refreshed',
      count: registeredIds.length,
      ids: registeredIds,
      staleRemovedCount: staleIds.length,
    },
    'MCP toolsets refreshed',
  );
}

export async function refreshMcpToolsets(options?: {
  serverIds?: string[];
  refreshTools?: boolean;
}): Promise<void> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshMcpToolsetsInternal(options).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function getMcpServerPresentation(serverId: string): McpServerPresentation | undefined {
  return serverPresentationById.get(serverId);
}
