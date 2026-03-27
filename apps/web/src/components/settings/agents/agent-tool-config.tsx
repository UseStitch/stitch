import { SearchIcon, Settings2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { parseMcpToolName } from '@stitch/shared/mcp/types';
import type { AgentPermissionValue } from '@stitch/shared/permissions/types';

import { PermissionPolicyEditor, PATTERN_POLICY_TOOLS } from './permission-policy-editor';
import { PermissionSelect } from './permission-select';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  agentMcpServersQueryOptions,
  agentPermissionsQueryOptions,
  agentToolConfigQueryOptions,
  useSetAgentToolEnabled,
  useUpsertAgentPermission,
} from '@/lib/queries/agents';

type AgentToolConfigProps = {
  agentId: string;
};

export function AgentToolConfig({ agentId }: AgentToolConfigProps) {
  const { data: toolConfig } = useSuspenseQuery(agentToolConfigQueryOptions(agentId));
  const { data: linkedServers } = useSuspenseQuery(agentMcpServersQueryOptions(agentId));
  const { data: permissions } = useSuspenseQuery(agentPermissionsQueryOptions(agentId));
  const setToolEnabled = useSetAgentToolEnabled();
  const upsertPermission = useUpsertAgentPermission();

  const [search, setSearch] = React.useState('');
  const [editingTool, setEditingTool] = React.useState<string | null>(null);

  const serverNameMap = new Map(linkedServers.map((server) => [server.id as string, server.name]));

  const getGlobalPermission = (toolName: string): AgentPermissionValue => {
    const rule = permissions.find(
      (permission) => permission.toolName === toolName && permission.pattern === null,
    );
    return rule?.permission ?? 'ask';
  };

  const handleToggle = (toolType: 'stitch' | 'mcp', toolName: string, enabled: boolean) => {
    void setToolEnabled
      .mutateAsync({ agentId, toolType, toolName, enabled })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update tool');
      });
  };

  const handlePermissionChange = (toolName: string, permission: AgentPermissionValue) => {
    void upsertPermission
      .mutateAsync({ agentId, toolName, pattern: null, permission })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update permission');
      });
  };

  if (editingTool) {
    return (
      <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
        <PermissionPolicyEditor
          agentId={agentId}
          toolName={editingTool}
          displayName={
            toolConfig.find((tool) => tool.toolName === editingTool)?.displayName ?? editingTool
          }
          onBack={() => setEditingTool(null)}
        />
      </React.Suspense>
    );
  }

  const query = search.trim().toLowerCase();
  const stitchTools = toolConfig.filter(
    (tool) =>
      tool.toolType === 'stitch' &&
      (query === '' || tool.displayName.toLowerCase().includes(query)),
  );

  const mcpGroups = new Map<string, { toolName: string; enabled: boolean }[]>();
  for (const tool of toolConfig) {
    if (tool.toolType !== 'mcp') continue;
    const parsed = parseMcpToolName(tool.toolName);
    if (!parsed) continue;
    if (query !== '' && !parsed.toolName.toLowerCase().includes(query)) continue;
    const group = mcpGroups.get(parsed.serverId) ?? [];
    group.push({ toolName: tool.toolName, enabled: tool.enabled });
    mcpGroups.set(parsed.serverId, group);
  }

  const isTogglePending = setToolEnabled.isPending;
  const isPermissionPending = upsertPermission.isPending;

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search tools..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
                  {tool.enabled ? (
                    <>
                      <PermissionSelect
                        value={permission}
                        onChange={(value) => handlePermissionChange(tool.toolName, value)}
                        disabled={isPermissionPending}
                      />
                      <div className="flex size-7 items-center justify-center">
                        {hasPatternEditor && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditingTool(tool.toolName)}
                            aria-label={`Configure ${tool.toolName} permissions`}
                            className="size-7 text-muted-foreground/60 hover:text-foreground"
                          >
                            <Settings2Icon className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="w-28.75 shrink-0" />
                  )}
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={(checked) => handleToggle('stitch', tool.toolName, checked)}
                    disabled={isTogglePending}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.from(mcpGroups.entries()).map(([serverId, tools]) => (
        <div key={serverId} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {serverNameMap.get(serverId) ?? serverId}
          </p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {tools.map((tool) => {
              const parsed = parseMcpToolName(tool.toolName);
              const permission = getGlobalPermission(tool.toolName);

              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <p className="flex-1 font-mono text-sm">{parsed?.toolName ?? tool.toolName}</p>
                  {tool.enabled ? (
                    <PermissionSelect
                      value={permission}
                      onChange={(value) => handlePermissionChange(tool.toolName, value)}
                      disabled={isPermissionPending}
                    />
                  ) : (
                    <div className="w-20 shrink-0" />
                  )}
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={(checked) => handleToggle('mcp', tool.toolName, checked)}
                    disabled={isTogglePending}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {stitchTools.length === 0 && mcpGroups.size === 0 && (
        <p className="text-sm text-muted-foreground">No tools match &ldquo;{search}&rdquo;.</p>
      )}
    </div>
  );
}
