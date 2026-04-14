import { SearchIcon, Settings2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ToolPermissionValue } from '@stitch/shared/permissions/types';

import {
  PATTERN_POLICY_TOOLS,
  PermissionPolicyEditor,
} from './permissions/permission-policy-editor';
import { PermissionSelect } from './permissions/permission-select';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  knownMcpToolsQueryOptions,
  knownToolsQueryOptions,
  toolPermissionsQueryOptions,
  useUpsertToolPermission,
} from '@/lib/queries/tools';

function PermissionsContent() {
  const { data: knownTools } = useSuspenseQuery(knownToolsQueryOptions);
  const { data: knownMcpTools } = useSuspenseQuery(knownMcpToolsQueryOptions);
  const { data: permissions } = useSuspenseQuery(toolPermissionsQueryOptions);
  const upsertPermission = useUpsertToolPermission();

  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState('all');
  const [editingTool, setEditingTool] = React.useState<string | null>(null);
  const mcpServerNames = Array.from(new Set(knownMcpTools.map((tool) => tool.serverName))).sort();

  const mcpServerNameByTool = React.useMemo(() => {
    return new Map(knownMcpTools.map((tool) => [tool.name, tool.serverName]));
  }, [knownMcpTools]);

  const mcpToolMetaByTool = React.useMemo(() => {
    return new Map(
      knownMcpTools.map((tool) => [
        tool.name,
        {
          serverIconPath: tool.serverIconPath,
          toolIconPath: tool.toolIconPath,
        },
      ]),
    );
  }, [knownMcpTools]);

  const getGlobalPermission = (toolName: string): ToolPermissionValue => {
    const rule = permissions.find((permission) => {
      return permission.toolName === toolName && permission.pattern === null;
    });
    return rule?.permission ?? 'ask';
  };

  const handlePermissionChange = (toolName: string, permission: ToolPermissionValue) => {
    void upsertPermission
      .mutateAsync({ toolName, pattern: null, permission })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update permission');
      });
  };

  if (editingTool) {
    const tool = knownTools.find((item) => item.toolName === editingTool);
    return (
      <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
        <PermissionPolicyEditor
          toolName={editingTool}
          displayName={tool?.displayName ?? editingTool}
          onBack={() => setEditingTool(null)}
        />
      </React.Suspense>
    );
  }

  const query = search.trim().toLowerCase();
  const searchFilteredTools = knownTools.filter((tool) => {
    if (query === '') return true;
    const serverName = mcpServerNameByTool.get(tool.toolName)?.toLowerCase() ?? '';
    return (
      tool.displayName.toLowerCase().includes(query) ||
      tool.toolName.toLowerCase().includes(query) ||
      serverName.includes(query)
    );
  });

  const selectedServerName = scope.startsWith('mcp:') ? scope.slice(4) : null;
  const filteredTools = searchFilteredTools.filter((tool) => {
    if (scope === 'all') return true;
    if (scope === 'stitch') return tool.toolType === 'stitch';
    if (scope === 'providers') return tool.toolType === 'plugin';
    if (selectedServerName) {
      return tool.toolType === 'mcp' && mcpServerNameByTool.get(tool.toolName) === selectedServerName;
    }
    return true;
  });

  const stitchTools = filteredTools.filter((tool) => tool.toolType === 'stitch');
  const pluginTools = filteredTools.filter((tool) => tool.toolType === 'plugin');
  const mcpTools = filteredTools.filter((tool) => tool.toolType === 'mcp');

  const mcpToolsByServer = new Map<string, typeof mcpTools>();
  for (const tool of mcpTools) {
    const serverName = mcpServerNameByTool.get(tool.toolName) ?? 'MCP';
    const group = mcpToolsByServer.get(serverName) ?? [];
    group.push(tool);
    mcpToolsByServer.set(serverName, group);
  }

  const isMutating = upsertPermission.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Permissions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure default approval behavior for built-in, MCP, and provider tools
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search tools..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={scope} onValueChange={(value) => setScope(value ?? 'all')}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue>
              {scope === 'all' ? (
                'All'
              ) : scope === 'stitch' ? (
                <span className="flex w-full items-center justify-between gap-2">
                  <span>Stitch tools</span>
                  <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                    Stitch
                  </span>
                </span>
              ) : scope === 'providers' ? (
                'Provider tools'
              ) : (
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{selectedServerName ?? 'MCP server'}</span>
                  <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                    MCP
                  </span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="stitch">
              <span className="flex w-full items-center justify-between gap-2">
                <span>Stitch tools</span>
                <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                  Stitch
                </span>
              </span>
            </SelectItem>
            <SelectItem value="providers">Provider tools</SelectItem>
            {mcpServerNames.map((serverName) => (
              <SelectItem key={serverName} value={`mcp:${serverName}`}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{serverName}</span>
                  <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                    MCP
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {stitchTools.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Stitch</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {stitchTools.map((tool) => {
              const hasPatternEditor = PATTERN_POLICY_TOOLS.has(tool.toolName);
              const permission = getGlobalPermission(tool.toolName);

              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <p className="flex-1 text-sm">{tool.displayName}</p>
                  {hasPatternEditor ? (
                    <div className="flex size-7 items-center justify-center">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingTool(tool.toolName)}
                        aria-label={`Configure ${tool.toolName} permissions`}
                        className="size-7 text-muted-foreground/60 hover:text-foreground"
                      >
                        <Settings2Icon className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="size-7" />
                  )}
                  <PermissionSelect
                    value={permission}
                    onChange={(value) => handlePermissionChange(tool.toolName, value)}
                    includeDeny
                    disabled={isMutating}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.from(mcpToolsByServer.entries()).map(([serverName, tools]) => (
        <div key={serverName} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{serverName}</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {tools.map((tool) => {
              const permission = getGlobalPermission(tool.toolName);
              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  {(() => {
                    const icon = mcpToolMetaByTool.get(tool.toolName);
                    const iconPath = icon?.toolIconPath ?? icon?.serverIconPath;
                    if (!iconPath) return null;
                    return (
                      <img
                        src={iconPath}
                        alt=""
                        className="size-4 shrink-0 rounded-sm"
                        loading="lazy"
                      />
                    );
                  })()}
                  <p className="flex-1 font-mono text-sm">{tool.displayName}</p>
                  <PermissionSelect
                    value={permission}
                    onChange={(value) => handlePermissionChange(tool.toolName, value)}
                    includeDeny
                    disabled={isMutating}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {pluginTools.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Providers</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {pluginTools.map((tool) => {
              const permission = getGlobalPermission(tool.toolName);
              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <p className="flex-1 text-sm">{tool.displayName}</p>
                  <PermissionSelect
                    value={permission}
                    onChange={(value) => handlePermissionChange(tool.toolName, value)}
                    includeDeny
                    disabled={isMutating}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filteredTools.length === 0 && (
        <p className="text-sm text-muted-foreground">No tools match &ldquo;{search}&rdquo;.</p>
      )}
    </div>
  );
}

export function PermissionsSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <PermissionsContent />
    </React.Suspense>
  );
}
