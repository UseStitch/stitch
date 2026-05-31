import {
  BrainIcon,
  CheckIcon,
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  HelpCircleIcon,
  ListTodoIcon,
  PencilIcon,
  SearchIcon,
  ServerIcon,
  Settings2Icon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { PermissionPolicyEditor } from './permissions/permission-policy-editor';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { RemoteImageIcon } from '@/components/icons/remote-icon';
import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import {
  filterCoreTools,
  filterToolsetsByQuery,
} from '@/components/settings/permissions/filtering';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  knownMcpToolsQueryOptions,
  knownToolsetsQueryOptions,
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
      subtitle: string;
      tools: { toolName: string; displayName: string }[];
      perToolEnabledScope?: 'tool' | 'mcp_tool';
    };

type ScopeFilter = 'stitch' | 'native' | 'connectors' | 'mcp';

type ToolRowProps = {
  name: string;
  icon?: React.ReactNode;
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

type ToolsetRowProps = {
  name: string;
  description: string;
  icon?: React.ReactNode;
  enabled: boolean;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isMutating: boolean;
  settingsAlign?: 'start' | 'end';
};

function ToolRow({
  name,
  icon,
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
        {icon ??
          (iconPath && (
            <RemoteImageIcon
              path={iconPath}
              label={`${name} icon`}
              className="size-4"
              fallback={null}
            />
          ))}
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

function ToolsetRow({
  name,
  description,
  icon,
  enabled,
  onConfigure,
  onToggleEnabled,
  isMutating,
  settingsAlign = 'start',
}: ToolsetRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ?? <ServerIcon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onConfigure}
        className={cn(
          'h-7 w-full px-2 text-muted-foreground hover:text-foreground',
          settingsAlign === 'end' ? 'justify-end' : 'justify-start',
        )}
      >
        <Settings2Icon className="size-3.5" />
        Settings
      </Button>
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

function CoreToolIcon({ toolName }: { toolName: string }) {
  const className = 'size-4 shrink-0 text-muted-foreground';

  if (toolName === 'bash' || toolName === 'execute_typescript') {
    return <TerminalIcon className={className} />;
  }

  if (toolName === 'read') return <FileTextIcon className={className} />;
  if (toolName === 'edit') return <PencilIcon className={className} />;
  if (toolName === 'write') return <FilePlusIcon className={className} />;

  if (toolName === 'grep' || toolName === 'glob') {
    return <SearchIcon className={className} />;
  }

  if (toolName === 'webfetch' || toolName.startsWith('browser_')) {
    return <GlobeIcon className={className} />;
  }

  if (toolName === 'task') return <WrenchIcon className={className} />;
  if (toolName === 'question') return <HelpCircleIcon className={className} />;
  if (toolName === 'skill') return <CheckIcon className={className} />;
  if (toolName === 'memory') return <BrainIcon className={className} />;
  if (toolName === 'todo') return <ListTodoIcon className={className} />;

  return <FilePenIcon className={className} />;
}

function ToolsContent() {
  const { data: knownTools } = useSuspenseQuery(knownToolsQueryOptions);
  const { data: knownMcpTools } = useSuspenseQuery(knownMcpToolsQueryOptions);
  const { data: knownToolsets } = useSuspenseQuery(knownToolsetsQueryOptions);
  const { data: enabledStates } = useSuspenseQuery(toolEnabledStatesQueryOptions);
  const setToolEnabledState = useSetToolEnabledState();

  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState<ScopeFilter>('stitch');
  const [editingTarget, setEditingTarget] = React.useState<EditingTarget | null>(null);

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
  const stitchTools = filterCoreTools(knownTools, query);

  const filteredToolsets = filterToolsetsByQuery(knownToolsets, query);

  const nativeToolsets = filteredToolsets.filter((toolset) => toolset.source === 'native');
  const connectorToolsets = filteredToolsets.filter((toolset) => toolset.source === 'connector');

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

  const visibleStitch = scope === 'stitch';
  const visibleNative = scope === 'native';
  const visibleConnectors = scope === 'connectors';
  const visibleMcp = scope === 'mcp';

  const enabledCount =
    (visibleStitch ? stitchTools.filter((tool) => getEnabled('tool', tool.toolName)).length : 0) +
    (visibleNative
      ? nativeToolsets.filter((toolset) => getEnabled('toolset', toolset.id)).length
      : 0) +
    (visibleConnectors
      ? connectorToolsets.filter((toolset) => getEnabled('toolset', toolset.id)).length
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
    (visibleNative ? nativeToolsets.length : 0) +
    (visibleConnectors ? connectorToolsets.length : 0) +
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
            placeholder="Search by tool, toolset, or MCP server..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'stitch', label: 'Core tools' },
              { id: 'native', label: 'Native toolsets' },
              { id: 'connectors', label: 'Connector tools' },
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
                icon={<CoreToolIcon toolName={tool.toolName} />}
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

      {visibleNative && nativeToolsets.length > 0 && (
        <SectionCard
          title="Native toolsets"
          description="Built-in toolsets available in Stitch"
          count={nativeToolsets.length}
        >
          <div className="divide-y divide-border/40">
            {nativeToolsets.map((toolset) => (
              <ToolsetRow
                key={toolset.id}
                name={toolset.name}
                description={toolset.description}
                enabled={getEnabled('toolset', toolset.id)}
                settingsAlign="end"
                onConfigure={() =>
                  setEditingTarget({
                    type: 'toolset',
                    toolsetId: toolset.id,
                    displayName: toolset.name,
                    subtitle: 'Native toolset',
                    tools: toolset.tools,
                  })
                }
                onToggleEnabled={(checked) => updateEnabled('toolset', toolset.id, checked)}
                isMutating={isMutating}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {visibleConnectors && connectorToolsets.length > 0 && (
        <SectionCard
          title="Connector tools"
          description="Toolsets from connected apps like Google Workspace"
          count={connectorToolsets.length}
        >
          <div className="divide-y divide-border/40">
            {connectorToolsets.map((toolset) => (
              <ToolsetRow
                key={toolset.id}
                name={toolset.name}
                description={toolset.description}
                icon={
                  toolset.icon ? (
                    <ConnectorIcon
                      icon={toolset.icon}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ) : undefined
                }
                enabled={getEnabled('toolset', toolset.id)}
                settingsAlign="end"
                onConfigure={() =>
                  setEditingTarget({
                    type: 'toolset',
                    toolsetId: toolset.id,
                    displayName: toolset.name,
                    subtitle: 'Connector toolset',
                    tools: toolset.tools,
                  })
                }
                onToggleEnabled={(checked) => updateEnabled('toolset', toolset.id, checked)}
                isMutating={isMutating}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {visibleMcp && filteredMcpGroups.length > 0 && (
        <SectionCard
          title="MCP servers"
          description="Enable entire servers and open settings to manage server tools"
          count={filteredMcpGroups.length}
        >
          <div className="divide-y divide-border/40">
            {filteredMcpGroups.map((group) => {
              return (
                <div key={group.serverId} className="flex flex-col">
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 px-3 py-2.5 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <McpServerLogo
                        serverId={group.serverId}
                        name={group.serverName}
                        className="size-4 shrink-0"
                      />
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
                          subtitle: 'MCP server',
                          perToolEnabledScope: 'mcp_tool',
                          tools: group.tools.map((tool) => ({
                            toolName: tool.toolName,
                            displayName: tool.displayName,
                          })),
                        })
                      }
                    >
                      <Settings2Icon className="size-3.5" />
                      Settings
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
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {((visibleStitch && stitchTools.length === 0) || !visibleStitch) &&
        ((visibleNative && nativeToolsets.length === 0) || !visibleNative) &&
        ((visibleConnectors && connectorToolsets.length === 0) || !visibleConnectors) &&
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
