import { formatMcpToolName } from '@stitch/shared/mcp/types';
import type { McpIcon, McpRegistryServer } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';
import { buildAuthHeaders } from '@/mcp/auth.js';
import { getMcpClient, withMcpClient } from '@/mcp/client.js';
import { buildServerPresentation } from '@/mcp/presentation.js';
import type { McpServerLiveInfo, McpServerPresentation } from '@/mcp/presentation.js';
import { findMcpRegistryServerForInstall } from '@/mcp/registry-service.js';
import { fetchMcpTools, getMcpServersWithCachedTools } from '@/mcp/service.js';
import type { McpServerWithTools } from '@/mcp/service.js';
import { permissionMiddleware } from '@/tools/runtime/middleware.js';
import { createToolRuntime } from '@/tools/runtime/runtime.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import {
  getToolset,
  listToolsets,
  registerToolset,
  unregisterToolset,
} from '@/tools/toolsets/registry.js';
import type { Toolset, ToolsetPrompt } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

export { evictMcpClient } from '@/mcp/client.js';

const log = Log.create({ service: 'mcp-tool-executor' });

let refreshInFlight: Promise<void> | null = null;

type McpToolExecutorDeps = {
  getMcpServersWithCachedTools: typeof getMcpServersWithCachedTools;
  fetchMcpTools: typeof fetchMcpTools;
  fetchServerInfo: typeof fetchServerInfo;
  fetchServerPrompts: typeof fetchServerPrompts;
  findRegistryServer: typeof findMcpRegistryServerForInstall;
  buildServerPresentation: typeof buildServerPresentation;
};

const DEFAULT_DEPS: McpToolExecutorDeps = {
  getMcpServersWithCachedTools,
  fetchMcpTools,
  fetchServerInfo,
  fetchServerPrompts,
  findRegistryServer: findMcpRegistryServerForInstall,
  buildServerPresentation,
};

async function getToolsForServer(
  server: McpServerWithTools,
  context: ToolContext,
): Promise<Record<string, Tool>> {
  const rawTools = await withMcpClient(
    server,
    (client) => client.tools() as Promise<Record<string, Tool>>,
  );

  const runtime = createToolRuntime(context).use(permissionMiddleware());
  const prefixed: Record<string, Tool> = {};
  for (const [toolName, toolDef] of Object.entries(rawTools)) {
    const prefixedName = formatMcpToolName(server.id, toolName);
    prefixed[prefixedName] = runtime.wrapTool(prefixedName, toolDef, {
      source: 'mcp',
      permission: { getPatternTargets: () => [], getSuggestion: () => null },
    });
  }
  return prefixed;
}

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

function buildMcpToolsetId(serverId: string): string {
  return `mcp:${serverId}`;
}

function buildToolsetDescription(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
  registryServer: McpRegistryServer | null,
): string {
  const prefix = formatMcpToolName(server.id, '...');

  if (liveInfo?.description) {
    return `${liveInfo.description} Activate this toolset to use its prefixed MCP tools (for example ${prefix}).`;
  }

  if (registryServer?.description) {
    return registryServer.description;
  }

  const toolDescriptions = (server.tools ?? [])
    .map((tool) => tool.description?.trim())
    .filter((description): description is string => !!description)
    .slice(0, 2);

  if (toolDescriptions.length > 0) {
    return toolDescriptions.join(' ');
  }

  const toolCount = server.tools?.length ?? 0;
  return `MCP server "${server.name}" - provides ${toolCount} tool(s). Activate this toolset to use its prefixed MCP tools (for example ${prefix}).`;
}

function buildMcpInstructions(input: {
  server: McpServerWithTools;
  liveInfo: McpServerLiveInfo | null;
  prompts: ToolsetPrompt[];
}): string | undefined {
  const exactNameRule = [
    'Use the exact toolset ID and exact callable tool names exactly as listed.',
    'Do not invent aliases, shortened names, camelCase variants, or unprefixed MCP tool names.',
    `All callable tools from this server are prefixed with ${formatMcpToolName(input.server.id, '...')}.`,
  ].join(' ');

  const promptRule =
    input.prompts.length > 0
      ? 'This toolset also exposes MCP prompt templates. Inspect the listed prompt names and arguments before using them.'
      : null;

  const liveInstructions = input.liveInfo?.instructions?.trim();
  return [exactNameRule, promptRule, liveInstructions].filter(Boolean).join('\n\n') || undefined;
}

function createMcpToolset(
  server: McpServerWithTools,
  liveInfo: McpServerLiveInfo | null,
  registryServer: McpRegistryServer | null,
  prompts: ToolsetPrompt[],
  presentation: McpServerPresentation,
): Toolset {
  const toolsetId = buildMcpToolsetId(server.id);
  const cachedTools = server.tools ?? [];
  const displayName = registryServer?.name ?? server.name ?? liveInfo?.title ?? liveInfo?.name;
  const description = buildToolsetDescription(server, liveInfo, registryServer);

  return {
    id: toolsetId,
    kind: 'mcp',
    name: displayName,
    description,
    instructions: buildMcpInstructions({ server, liveInfo, prompts }),
    prompts: prompts.length > 0 ? prompts : undefined,
    presentation,
    tools: () =>
      cachedTools.map((tool) => ({
        name: formatMcpToolName(server.id, tool.name),
        description:
          tool.description ??
          `Tool from MCP server "${displayName}". Use this exact prefixed tool name; do not call the unprefixed MCP tool name.`,
      })),
    activate: (context) => getToolsForServer(server, context),
  };
}

async function refreshMcpToolsetsInternal(
  options?: {
    serverIds?: string[];
    refreshTools?: boolean;
  },
  deps: McpToolExecutorDeps = DEFAULT_DEPS,
): Promise<void> {
  const refreshTools = options?.refreshTools ?? true;
  const configuredServers = await deps.getMcpServersWithCachedTools();
  const serverIdSet = options?.serverIds ? new Set(options.serverIds) : null;
  const serversToRefresh = serverIdSet
    ? configuredServers.filter((server) => serverIdSet.has(server.id))
    : configuredServers;

  const desiredMcpToolsetIds = new Set(
    configuredServers.map((server) => buildMcpToolsetId(server.id)),
  );
  const staleIds = listToolsets()
    .filter((toolset) => toolset.kind === 'mcp' && !desiredMcpToolsetIds.has(toolset.id))
    .map((toolset) => toolset.id);
  for (const staleId of staleIds) {
    unregisterToolset(staleId);
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
        ? await deps
            .fetchMcpTools(server.id)
            .then((result) => (isServiceError(result) ? (server.tools ?? []) : result.data))
            .catch(() => server.tools ?? [])
        : (server.tools ?? []);
      return {
        ...server,
        tools,
      } satisfies McpServerWithTools;
    }),
  );

  const infoResults = await Promise.allSettled(serverSnapshots.map(deps.fetchServerInfo));
  const promptResults = await Promise.allSettled(serverSnapshots.map(deps.fetchServerPrompts));
  const registryResults = await Promise.allSettled(
    serverSnapshots.map((server) =>
      deps.findRegistryServer({ name: server.name, url: server.url }),
    ),
  );

  const resolved = serverSnapshots.map((server, index) => ({
    server,
    liveInfo: infoResults[index]?.status === 'fulfilled' ? infoResults[index].value : null,
    prompts: promptResults[index]?.status === 'fulfilled' ? promptResults[index].value : [],
    registryServer:
      registryResults[index]?.status === 'fulfilled' ? registryResults[index].value : null,
  }));

  const presentations = await Promise.all(
    resolved.map((entry) =>
      deps.buildServerPresentation(entry.server, entry.liveInfo, entry.registryServer),
    ),
  );

  const registeredIds: string[] = [];
  for (const [index, { server, liveInfo, prompts, registryServer }] of resolved.entries()) {
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

    const toolset = createMcpToolset(
      server,
      liveInfo,
      registryServer,
      prompts,
      presentations[index],
    );
    registerToolset(toolset);
    registeredIds.push(toolset.id);
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

export async function refreshMcpToolsets(
  options?: {
    serverIds?: string[];
    refreshTools?: boolean;
  },
  deps?: Partial<McpToolExecutorDeps>,
): Promise<void> {
  const resolvedDeps: McpToolExecutorDeps = {
    ...DEFAULT_DEPS,
    ...deps,
  };

  const run = () => refreshMcpToolsetsInternal(options, resolvedDeps);

  if (deps) {
    return run();
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function getMcpServerPresentation(serverId: string): McpServerPresentation | undefined {
  return getToolset(buildMcpToolsetId(serverId))?.presentation;
}
