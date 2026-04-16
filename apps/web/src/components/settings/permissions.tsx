import {
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  ServerIcon,
  Settings2Icon,
  WrenchIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { PermissionPolicyEditor } from './permissions/permission-policy-editor';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  knownMcpToolsQueryOptions,
  knownToolsQueryOptions,
  toolEnabledStatesQueryOptions,
  useSetToolEnabledState,
} from '@/lib/queries/tools';
import { cn } from '@/lib/utils';

type EditingTarget =
  | {
      type: 'tool';
      toolName: string;
      displayName: string;
      enabledScope: 'tool' | 'toolset' | 'mcp_tool';
    }
  | {
      type: 'toolset';
      toolsetId: string;
      displayName: string;
      mcpTools: { toolName: string; displayName: string }[];
    };

type ScopeFilter = 'all' | 'stitch' | 'providers' | 'mcp';

type ToolRowProps = {
  name: string;
  subtitle?: string;
  iconPath?: string;
  technicalName?: string;
  enabled: boolean;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isMutating: boolean;
  reserveMiddleSlot?: boolean;
  isNested?: boolean;
};

function ToolRow({
  name,
  iconPath,
  enabled,
  onConfigure,
  onToggleEnabled,
  isMutating,
  reserveMiddleSlot = false,
  isNested = false,
}: ToolRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 px-3 py-2.5 sm:px-4',
        reserveMiddleSlot
          ? 'grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem]'
          : 'grid-cols-[minmax(0,1fr)_5rem_2.5rem]',
        isNested && 'pl-10 sm:pl-12 bg-muted/10',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {iconPath && (
          <img src={iconPath} alt="" className="size-4 shrink-0 rounded-sm" loading="lazy" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onConfigure}
        className="h-7 w-full justify-start px-2 text-muted-foreground hover:text-foreground"
      >
        <Settings2Icon className="size-3.5" />
        Settings
      </Button>
      {reserveMiddleSlot && <div className="h-7 w-full" aria-hidden="true" />}
      <div className="flex w-10 justify-end">
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} disabled={isMutating} />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </p>
      </div>
      {children}
    </section>
  );
}

function ToolsContent() {
  const { data: knownTools } = useSuspenseQuery(knownToolsQueryOptions);
  const { data: knownMcpTools } = useSuspenseQuery(knownMcpToolsQueryOptions);
  const { data: enabledStates } = useSuspenseQuery(toolEnabledStatesQueryOptions);
  const setToolEnabledState = useSetToolEnabledState();

  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState<ScopeFilter>('all');
  const [editingTarget, setEditingTarget] = React.useState<EditingTarget | null>(null);
  const [expandedServers, setExpandedServers] = React.useState<Record<string, boolean>>({});

  const mcpToolMetaByName = React.useMemo(() => {
    return new Map(
      knownMcpTools.map((tool) => [
        tool.name,
        {
          serverId: tool.serverId,
          serverName: tool.serverName,
          serverIconPath: tool.serverIconPath,
          toolIconPath: tool.toolIconPath,
        },
      ]),
    );
  }, [knownMcpTools]);

  const enabledMap = React.useMemo(() => {
    return new Map(
      enabledStates.map((state) => [`${state.scope}:${state.identifier}`, state.enabled]),
    );
  }, [enabledStates]);

  const getEnabled = React.useCallback(
    (kind: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => {
      return enabledMap.get(`${kind}:${identifier}`) ?? true;
    },
    [enabledMap],
  );

  const updateEnabled = React.useCallback(
    (kind: 'tool' | 'toolset' | 'mcp_tool', identifier: string, enabled: boolean) => {
      void setToolEnabledState
        .mutateAsync({ scope: kind, identifier, enabled })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update tool state');
        });
    },
    [setToolEnabledState],
  );

  const query = search.trim().toLowerCase();
  const stitchTools = knownTools
    .filter((tool) => tool.toolType === 'stitch')
    .filter((tool) => {
      if (!query) return true;
      return (
        tool.displayName.toLowerCase().includes(query) ||
        tool.toolName.toLowerCase().includes(query)
      );
    });

  const pluginTools = knownTools
    .filter((tool) => tool.toolType === 'plugin')
    .filter((tool) => {
      if (!query) return true;
      return (
        tool.displayName.toLowerCase().includes(query) ||
        tool.toolName.toLowerCase().includes(query)
      );
    });

  const mcpToolsetGroups = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        serverId: string;
        serverName: string;
        serverIconPath?: string;
        tools: { toolName: string; displayName: string; iconPath?: string }[];
      }
    >();

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
      .map((group) => ({
        ...group,
        tools: group.tools.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [knownTools, mcpToolMetaByName]);

  if (editingTarget) {
    return (
      <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
        <PermissionPolicyEditor
          target={editingTarget}
          onBack={() => setEditingTarget(null)}
          getEnabled={getEnabled}
          onToggleEnabled={updateEnabled}
        />
      </React.Suspense>
    );
  }

  const filteredMcpGroups = mcpToolsetGroups
    .map((group) => {
      if (!query) return group;
      const serverMatch = group.serverName.toLowerCase().includes(query);
      if (serverMatch) return group;

      const matchingTools = group.tools.filter(
        (tool) =>
          tool.displayName.toLowerCase().includes(query) ||
          tool.toolName.toLowerCase().includes(query),
      );

      return { ...group, tools: matchingTools };
    })
    .filter((group) => group.tools.length > 0);

  const visibleStitch = scope === 'all' || scope === 'stitch';
  const visibleProviders = scope === 'all' || scope === 'providers';
  const visibleMcp = scope === 'all' || scope === 'mcp';

  const enabledCount =
    (visibleStitch ? stitchTools.filter((tool) => getEnabled('tool', tool.toolName)).length : 0) +
    (visibleProviders
      ? pluginTools.filter((tool) => getEnabled('toolset', tool.toolName)).length
      : 0) +
    (visibleMcp
      ? filteredMcpGroups.reduce((count, group) => {
          const serverEnabled = getEnabled('toolset', `mcp:${group.serverId}`) ? 1 : 0;
          const toolsEnabled = group.tools.filter((tool) =>
            getEnabled('mcp_tool', tool.toolName),
          ).length;
          return count + serverEnabled + toolsEnabled;
        }, 0)
      : 0);

  const totalCount =
    (visibleStitch ? stitchTools.length : 0) +
    (visibleProviders ? pluginTools.length : 0) +
    (visibleMcp
      ? filteredMcpGroups.reduce((count, group) => count + 1 + group.tools.length, 0)
      : 0);

  const isMutating = setToolEnabledState.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold">Tools</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Keep only the tools you need enabled, then open settings for permission behavior.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-md border border-border/60 bg-background px-2 py-1">
            <span className="text-muted-foreground">Enabled </span>
            <span className="font-semibold text-foreground">{enabledCount}</span>
          </div>
          <div className="rounded-md border border-border/60 bg-background px-2 py-1">
            <span className="text-muted-foreground">Disabled </span>
            <span className="font-semibold text-foreground">
              {Math.max(totalCount - enabledCount, 0)}
            </span>
          </div>
          <div className="rounded-md border border-border/60 bg-background px-2 py-1 text-muted-foreground">
            Disabled tools are removed from agent availability
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by tool or MCP server..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'All tools' },
              { id: 'stitch', label: 'Core tools' },
              { id: 'providers', label: 'Provider tools' },
              { id: 'mcp', label: 'MCP servers' },
            ] as const
          ).map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={scope === option.id ? 'secondary' : 'outline'}
              className={cn(scope === option.id ? 'border-border/70' : 'text-muted-foreground')}
              onClick={() => setScope(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {visibleStitch && stitchTools.length > 0 && (
        <SectionCard
          title="Core tools"
          description="Built-in tools provided by Stitch"
          count={stitchTools.length}
        >
          <div className="divide-y divide-border/40">
            {stitchTools.map((tool) => (
              <ToolRow
                key={tool.toolName}
                name={tool.displayName}
                technicalName={tool.toolName}
                enabled={getEnabled('tool', tool.toolName)}
                onConfigure={() =>
                  setEditingTarget({
                    type: 'tool',
                    toolName: tool.toolName,
                    displayName: tool.displayName,
                    enabledScope: 'tool',
                  })
                }
                onToggleEnabled={(checked) => updateEnabled('tool', tool.toolName, checked)}
                isMutating={isMutating}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {visibleProviders && pluginTools.length > 0 && (
        <SectionCard
          title="Provider tools"
          description="Tool integrations shipped by model providers"
          count={pluginTools.length}
        >
          <div className="divide-y divide-border/40">
            {pluginTools.map((tool) => (
              <ToolRow
                key={tool.toolName}
                name={tool.displayName}
                subtitle="Provider toolset"
                technicalName={tool.toolName}
                enabled={getEnabled('toolset', tool.toolName)}
                onConfigure={() =>
                  setEditingTarget({
                    type: 'tool',
                    toolName: tool.toolName,
                    displayName: tool.displayName,
                    enabledScope: 'toolset',
                  })
                }
                onToggleEnabled={(checked) => updateEnabled('toolset', tool.toolName, checked)}
                isMutating={isMutating}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {visibleMcp && filteredMcpGroups.length > 0 && (
        <SectionCard
          title="MCP servers"
          description="Enable entire servers or fine-tune individual MCP tools"
          count={filteredMcpGroups.length}
        >
          <div className="divide-y divide-border/40">
            {filteredMcpGroups.map((group) => {
              const isExpanded = query.length > 0 || expandedServers[group.serverId] === true;

              return (
                <div key={group.serverId} className="flex flex-col">
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem] items-center gap-3 px-3 py-2.5 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {group.serverIconPath ? (
                        <img
                          src={group.serverIconPath}
                          alt=""
                          className="size-4 shrink-0 rounded-sm"
                          loading="lazy"
                        />
                      ) : (
                        <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{group.serverName}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.tools.length} tool{group.tools.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-full justify-start px-2 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setEditingTarget({
                          type: 'toolset',
                          toolsetId: `mcp:${group.serverId}`,
                          displayName: group.serverName,
                          mcpTools: group.tools.map((tool) => ({
                            toolName: tool.toolName,
                            displayName: tool.displayName,
                          })),
                        })
                      }
                    >
                      <Settings2Icon className="size-3.5" />
                      Settings
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-full justify-start px-2 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setExpandedServers((current) => ({
                          ...current,
                          [group.serverId]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-3.5" />
                      ) : (
                        <ChevronRightIcon className="size-3.5" />
                      )}
                      {isExpanded ? 'Hide' : 'Show'}
                    </Button>
                    <div className="flex w-10 justify-end">
                      <Switch
                        checked={getEnabled('toolset', `mcp:${group.serverId}`)}
                        onCheckedChange={(checked) =>
                          updateEnabled('toolset', `mcp:${group.serverId}`, checked)
                        }
                        disabled={isMutating}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="divide-y divide-border/40 border-t border-border/40">
                      {group.tools.map((tool) => (
                        <ToolRow
                          key={tool.toolName}
                          name={tool.displayName}
                          iconPath={tool.iconPath}
                          enabled={getEnabled('mcp_tool', tool.toolName)}
                          reserveMiddleSlot
                          isNested
                          onConfigure={() =>
                            setEditingTarget({
                              type: 'tool',
                              toolName: tool.toolName,
                              displayName: tool.displayName,
                              enabledScope: 'mcp_tool',
                            })
                          }
                          onToggleEnabled={(checked) =>
                            updateEnabled('mcp_tool', tool.toolName, checked)
                          }
                          isMutating={isMutating}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {((visibleStitch && stitchTools.length === 0) || !visibleStitch) &&
        ((visibleProviders && pluginTools.length === 0) || !visibleProviders) &&
        ((visibleMcp && filteredMcpGroups.length === 0) || !visibleMcp) && (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
            <WrenchIcon className="mx-auto mb-2 size-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tools match your current filters.</p>
          </div>
        )}

      <p className="text-xs text-muted-foreground">
        Tip: use <span className="font-medium text-foreground">Settings</span> to configure ask,
        allow, deny, and path/command rules.
      </p>
    </div>
  );
}

export function ToolsSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <ToolsContent />
    </React.Suspense>
  );
}
