import { Settings2Icon } from 'lucide-react';

import { EmptyState, SectionCard } from './components';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import type { EditingTarget } from '@/components/settings/permissions/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type McpToolGroup = {
  serverId: string;
  serverName: string;
  serverIconPath?: string;
  tools: { toolName: string; displayName: string; iconPath?: string }[];
};

type KnownTool = { toolName: string; displayName: string; toolType: string };

type McpToolMeta = { serverId: string; serverName: string; serverIconPath?: string; toolIconPath?: string };

export function useMcpToolsetGroups(
  knownTools: KnownTool[],
  mcpToolMetaByName: Map<string, McpToolMeta>,
): McpToolGroup[] {
  const groups = new Map<string, McpToolGroup>();

  for (const tool of knownTools) {
    if (tool.toolType !== 'mcp') continue;
    const meta = mcpToolMetaByName.get(tool.toolName);
    if (!meta) continue;

    const current = groups.get(meta.serverId) ?? {
      serverId: meta.serverId,
      serverName: meta.serverName,
      serverIconPath: meta.serverIconPath,
      tools: [],
    };

    current.tools.push({
      toolName: tool.toolName,
      displayName: tool.displayName,
      iconPath: meta.toolIconPath ?? meta.serverIconPath,
    });
    groups.set(meta.serverId, current);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, tools: group.tools.toSorted((a, b) => a.displayName.localeCompare(b.displayName)) }))
    .toSorted((a, b) => a.serverName.localeCompare(b.serverName));
}

export function filterMcpGroups(groups: McpToolGroup[], query: string): McpToolGroup[] {
  if (!query) return groups;

  return groups.reduce<McpToolGroup[]>((acc, group) => {
    const serverMatch = group.serverName.toLowerCase().includes(query);
    if (serverMatch) {
      acc.push(group);
      return acc;
    }

    const matchingTools = group.tools.filter(
      (tool) => tool.displayName.toLowerCase().includes(query) || tool.toolName.toLowerCase().includes(query),
    );

    if (matchingTools.length > 0) acc.push({ ...group, tools: matchingTools });
    return acc;
  }, []);
}

type McpToolsTabProps = {
  groups: McpToolGroup[];
  getEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => boolean;
  updateEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string, enabled: boolean) => void;
  isMutating: boolean;
  onEditTarget: (target: EditingTarget) => void;
};

export function McpToolsTab({ groups, getEnabled, updateEnabled, isMutating, onEditTarget }: McpToolsTabProps) {
  if (groups.length === 0) return <EmptyState />;

  return (
    <SectionCard
      title="MCP servers"
      description="Enable entire servers and open settings to manage server tools"
      count={groups.length}>
      <div className="divide-y divide-border-subtle">
        {groups.map((group) => (
          <Stack key={group.serverId}>
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-space-l px-space-l py-space-m sm:px-space-xl">
              <div className="flex min-w-0 items-center gap-space-m">
                <McpServerLogo serverId={group.serverId} name={group.serverName} className="size-4 shrink-0" />
                <div className="min-w-0">
                  <Text variant="body-strong" truncate>
                    {group.serverName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {group.tools.length} tool{group.tools.length === 1 ? '' : 's'}
                  </Text>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start px-space-m text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onEditTarget({
                    type: 'toolset',
                    toolsetId: `mcp:${group.serverId}`,
                    displayName: group.serverName,
                    subtitle: 'MCP server',
                    perToolEnabledScope: 'mcp_tool',
                    tools: group.tools.map((tool) => ({ toolName: tool.toolName, displayName: tool.displayName })),
                  })
                }>
                <Icon as={Settings2Icon} size="s" />
                Settings
              </Button>
              <div className="flex w-10 justify-end">
                <Switch
                  checked={getEnabled('toolset', `mcp:${group.serverId}`)}
                  onCheckedChange={(checked) => updateEnabled('toolset', `mcp:${group.serverId}`, checked)}
                  disabled={isMutating}
                />
              </div>
            </div>
          </Stack>
        ))}
      </div>
    </SectionCard>
  );
}
