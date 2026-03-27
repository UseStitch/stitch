import {
  ArrowLeftIcon,
  BotIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';
import type { AgentType } from '@stitch/shared/agents/types';
import type { McpServer } from '@stitch/shared/mcp/types';
import { parseMcpToolName } from '@stitch/shared/mcp/types';
import type { AgentPermission, AgentPermissionValue } from '@stitch/shared/permissions/types';
import type { BashPreset } from '@stitch/shared/tools/bash-presets';
import { BASH_COMMON_PRESETS } from '@stitch/shared/tools/bash-presets';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  agentMcpServersQueryOptions,
  agentPermissionsQueryOptions,
  agentSubAgentsQueryOptions,
  agentToolConfigQueryOptions,
  agentsQueryOptions,
  useAddMcpServerToAgent,
  useAddSubAgentToAgent,
  useCreateAgent,
  useDeleteAgent,
  useDeleteAgentPermission,
  useRemoveMcpServerFromAgent,
  useRemoveSubAgentFromAgent,
  useSetAgentToolEnabled,
  useSetDefaultAgent,
  useUpdateAgent,
  useUpdateSubAgentConfig,
  useUpsertAgentPermission,
} from '@/lib/queries/agents';
import type { SubAgentLink } from '@/lib/queries/agents';
import { mcpServersQueryOptions } from '@/lib/queries/mcp';
import { visibleProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

type AgentEditorMode =
  | { type: 'create'; agentType: AgentType }
  | {
      type: 'edit';
      agent: Agent;
    };

type AgentFormState = {
  name: string;
  useBasePrompt: boolean;
  systemPrompt: string;
};

function toFormState(agent: Agent): AgentFormState {
  return {
    name: agent.name,
    useBasePrompt: agent.useBasePrompt,
    systemPrompt: agent.systemPrompt ?? '',
  };
}

function encodeModelValue(providerId: string, modelId: string): string {
  return JSON.stringify({ providerId, modelId });
}

function decodeModelValue(value: string): { providerId: string; modelId: string } | null {
  try {
    const parsed = JSON.parse(value) as { providerId?: string; modelId?: string };
    if (parsed.providerId && parsed.modelId)
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    return null;
  } catch {
    return null;
  }
}

function buildModelLabel(
  providerModels: ProviderModels[],
  providerId: string,
  modelId: string,
): string {
  for (const p of providerModels) {
    if (p.providerId !== providerId) continue;
    const model = p.models.find((m) => m.id === modelId);
    if (model) return `${p.providerName} / ${model.name}`;
  }
  return `${providerId} / ${modelId}`;
}

// Stitch tools that support file path pattern rules
const FILE_PATTERN_TOOLS = new Set(['read', 'edit', 'write', 'glob', 'grep']);
// Stitch tools that support command family pattern rules
const COMMAND_PATTERN_TOOLS = new Set(['bash']);
// All tools that have pattern-based policy editors
const PATTERN_POLICY_TOOLS = new Set([...FILE_PATTERN_TOOLS, ...COMMAND_PATTERN_TOOLS]);

// ─── Permission select ────────────────────────────────────────────────────────

const PERMISSION_OPTION_LABELS: Record<AgentPermissionValue, string> = {
  allow: 'Allow',
  ask: 'Ask',
  deny: 'Deny',
};

function PermissionSelect({
  value,
  onChange,
  includeDeny = false,
  disabled = false,
}: {
  value: AgentPermissionValue;
  onChange: (v: AgentPermissionValue) => void;
  includeDeny?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as AgentPermissionValue)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-20 shrink-0">
        <SelectValue>{PERMISSION_OPTION_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-0">
        <SelectItem value="allow">{PERMISSION_OPTION_LABELS.allow}</SelectItem>
        <SelectItem value="ask">{PERMISSION_OPTION_LABELS.ask}</SelectItem>
        {includeDeny && <SelectItem value="deny">{PERMISSION_OPTION_LABELS.deny}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

// ─── Permission Policy Editor ─────────────────────────────────────────────────

function PermissionPolicyEditor({
  agentId,
  toolName,
  displayName,
  onBack,
}: {
  agentId: string;
  toolName: string;
  displayName: string;
  onBack: () => void;
}) {
  const { data: permissions } = useSuspenseQuery(agentPermissionsQueryOptions(agentId));
  const upsertPermission = useUpsertAgentPermission();
  const deletePermission = useDeleteAgentPermission();

  const [newPattern, setNewPattern] = React.useState('');
  const [newPermission, setNewPermission] = React.useState<AgentPermissionValue>('ask');

  const toolPermissions = permissions.filter((p) => p.toolName === toolName);
  const globalRule = toolPermissions.find((p) => p.pattern === null);
  const patternRules = toolPermissions.filter((p) => p.pattern !== null);

  const globalPermission: AgentPermissionValue = globalRule?.permission ?? 'ask';

  const isFileTool = FILE_PATTERN_TOOLS.has(toolName);

  const isMutating = upsertPermission.isPending || deletePermission.isPending;

  const handleGlobalChange = (permission: AgentPermissionValue) => {
    void upsertPermission
      .mutateAsync({ agentId, toolName, pattern: null, permission })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to update permission');
      });
  };

  const handlePatternPermissionChange = (
    rule: AgentPermission,
    permission: AgentPermissionValue,
  ) => {
    void upsertPermission
      .mutateAsync({ agentId, toolName, pattern: rule.pattern, permission })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to update permission');
      });
  };

  const handleDeleteRule = (rule: AgentPermission) => {
    void deletePermission.mutateAsync({ agentId, permissionId: rule.id }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete rule');
    });
  };

  const handleAddRule = () => {
    const pattern = newPattern.trim();
    if (!pattern) return;

    void upsertPermission
      .mutateAsync({ agentId, toolName, pattern, permission: newPermission })
      .then(() => {
        setNewPattern('');
        setNewPermission('ask');
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to add rule');
      });
  };

  const handleBrowse = () => {
    void window.api?.files?.openPath?.().then((paths) => {
      if (!paths || paths.length === 0) return;
      const picked = paths[0];
      if (!picked) return;
      // Append wildcard for directories (heuristic: no file extension in last segment)
      const lastSegment = picked.split(/[/\\]/).at(-1) ?? '';
      const isLikelyDir = !lastSegment.includes('.');
      setNewPattern(isLikelyDir ? `${picked}/*` : picked);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to tools">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <p className="text-sm font-semibold">{displayName} permissions</p>
          <p className="text-xs text-muted-foreground">
            Configure when this tool requires approval
          </p>
        </div>
      </div>

      {/* Global (catch-all) rule */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Default behavior</p>
        <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
          <div>
            <p className="text-sm">All uses</p>
            <p className="text-xs text-muted-foreground">Applied when no specific rule matches</p>
          </div>
          <PermissionSelect
            value={globalPermission}
            onChange={handleGlobalChange}
            includeDeny
            disabled={isMutating}
          />
        </div>
      </div>

      {/* Pattern rules list */}
      {patternRules.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Specific rules</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {patternRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
              >
                <p className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {rule.pattern}
                </p>
                <PermissionSelect
                  value={rule.permission}
                  onChange={(v) => handlePatternPermissionChange(rule, v)}
                  includeDeny
                  disabled={isMutating}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleDeleteRule(rule)}
                  disabled={isMutating}
                  aria-label="Delete rule"
                  className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bash common presets */}
      {toolName === 'bash' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Common commands</p>
          <div className="flex flex-wrap gap-1.5">
            {BASH_COMMON_PRESETS.map((preset: BashPreset) => {
              const existing = patternRules.find((r) => r.pattern === preset.pattern);
              return (
                <button
                  key={preset.pattern}
                  type="button"
                  disabled={isMutating}
                  onClick={() => {
                    if (existing) {
                      handleDeleteRule(existing);
                    } else {
                      void upsertPermission
                        .mutateAsync({
                          agentId,
                          toolName,
                          pattern: preset.pattern,
                          permission: 'allow',
                        })
                        .catch((err: unknown) => {
                          toast.error(err instanceof Error ? err.message : 'Failed to add rule');
                        });
                    }
                  }}
                  className={[
                    'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    existing
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  ].join(' ')}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Add rule form */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {isFileTool ? 'Add path rule' : 'Add command rule'}
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder={isFileTool ? '/path/to/dir/*' : 'git *'}
              className={isFileTool ? 'pr-8 font-mono text-xs' : 'font-mono text-xs'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRule();
              }}
            />
            {isFileTool && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                onClick={handleBrowse}
                aria-label="Browse for path"
                tabIndex={-1}
              >
                <FolderOpenIcon className="size-3.5" />
              </Button>
            )}
          </div>
          <PermissionSelect
            value={newPermission}
            onChange={setNewPermission}
            includeDeny
            disabled={isMutating}
          />
          <Button size="sm" onClick={handleAddRule} disabled={!newPattern.trim() || isMutating}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AgentToolConfig ──────────────────────────────────────────────────────────

function AgentToolConfig({ agentId }: { agentId: string }) {
  const { data: toolConfig } = useSuspenseQuery(agentToolConfigQueryOptions(agentId));
  const { data: linkedServers } = useSuspenseQuery(agentMcpServersQueryOptions(agentId));
  const { data: permissions } = useSuspenseQuery(agentPermissionsQueryOptions(agentId));
  const setToolEnabled = useSetAgentToolEnabled();
  const upsertPermission = useUpsertAgentPermission();

  const [search, setSearch] = React.useState('');
  const [editingTool, setEditingTool] = React.useState<string | null>(null);

  const serverNameMap = new Map(linkedServers.map((s) => [s.id as string, s.name]));

  const getGlobalPermission = (toolName: string): AgentPermissionValue => {
    const rule = permissions.find((p) => p.toolName === toolName && p.pattern === null);
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
            toolConfig.find((t) => t.toolName === editingTool)?.displayName ?? editingTool
          }
          onBack={() => setEditingTool(null)}
        />
      </React.Suspense>
    );
  }

  const query = search.trim().toLowerCase();

  const stitchTools = toolConfig.filter(
    (t) => t.toolType === 'stitch' && (query === '' || t.displayName.toLowerCase().includes(query)),
  );

  // Group MCP tools by server ID
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
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {stitchTools.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Stitch</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {stitchTools.map((tool) => {
              const hasPatternEditor = PATTERN_POLICY_TOOLS.has(tool.toolName);
              const perm = getGlobalPermission(tool.toolName);
              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <p className="flex-1 text-sm">{tool.displayName}</p>
                  {tool.enabled ? (
                    <>
                      <PermissionSelect
                        value={perm}
                        onChange={(v) => handlePermissionChange(tool.toolName, v)}
                        disabled={isPermissionPending}
                      />
                      {/* Always reserve space for gear icon to keep alignment consistent */}
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
                    /* Reserve same total width when disabled so switch stays aligned */
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
              const perm = getGlobalPermission(tool.toolName);
              return (
                <div
                  key={tool.toolName}
                  className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <p className="flex-1 font-mono text-sm">{parsed?.toolName ?? tool.toolName}</p>
                  {tool.enabled ? (
                    <PermissionSelect
                      value={perm}
                      onChange={(v) => handlePermissionChange(tool.toolName, v)}
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

function AgentMcpServers({ agentId }: { agentId: string }) {
  const { data: linked } = useSuspenseQuery(agentMcpServersQueryOptions(agentId));
  const { data: allServers } = useSuspenseQuery(mcpServersQueryOptions);
  const addServer = useAddMcpServerToAgent();
  const removeServer = useRemoveMcpServerFromAgent();

  const linkedIds = new Set(linked.map((s) => s.id));
  const available = allServers.filter((s) => !linkedIds.has(s.id));

  const handleAdd = async (server: McpServer) => {
    try {
      await addServer.mutateAsync({ agentId, mcpServerId: server.id });
      toast.success(`${server.name} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add MCP server');
    }
  };

  const handleRemove = async (server: McpServer) => {
    try {
      await removeServer.mutateAsync({ agentId, mcpServerId: server.id });
      toast.success(`${server.name} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove MCP server');
    }
  };

  return (
    <div className="space-y-4">
      {linked.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border/50">
          {linked.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{server.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{server.url}</p>
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => void handleRemove(server)}
                disabled={removeServer.isPending}
                aria-label={`Remove ${server.name}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {linked.length === 0 && (
        <p className="text-sm text-muted-foreground">No MCP servers linked to this agent.</p>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Add server</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {available.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{server.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{server.url}</p>
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleAdd(server)}
                  disabled={addServer.isPending}
                  aria-label={`Add ${server.name}`}
                  className="shrink-0"
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {available.length === 0 && allServers.length > 0 && linked.length === allServers.length && (
        <p className="text-xs text-muted-foreground">All configured MCP servers are linked.</p>
      )}

      {allServers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No MCP servers configured. Add one in the MCP Servers settings.
        </p>
      )}
    </div>
  );
}

function SubAgentModelSelect({
  agentId,
  subAgent,
  providerModels,
}: {
  agentId: string;
  subAgent: SubAgentLink;
  providerModels: ProviderModels[];
}) {
  const updateConfig = useUpdateSubAgentConfig();

  const currentValue =
    subAgent.providerId && subAgent.modelId
      ? encodeModelValue(subAgent.providerId, subAgent.modelId)
      : 'inherit';

  const handleChange = (value: string | null) => {
    if (!value || value === 'inherit') {
      void updateConfig
        .mutateAsync({ agentId, subAgentId: subAgent.id, providerId: null, modelId: null })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update model');
        });
    } else {
      const decoded = decodeModelValue(value);
      if (!decoded) return;
      void updateConfig
        .mutateAsync({
          agentId,
          subAgentId: subAgent.id,
          providerId: decoded.providerId,
          modelId: decoded.modelId,
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update model');
        });
    }
  };

  return (
    <Select value={currentValue} onValueChange={handleChange} disabled={updateConfig.isPending}>
      <SelectTrigger size="sm" className="w-52 shrink-0">
        <SelectValue>
          {currentValue === 'inherit'
            ? 'Use parent model'
            : subAgent.providerId && subAgent.modelId
              ? buildModelLabel(providerModels, subAgent.providerId, subAgent.modelId)
              : 'Use parent model'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        <SelectItem value="inherit">Use parent model</SelectItem>
        {providerModels.map((provider) => (
          <React.Fragment key={provider.providerId}>
            {provider.models.map((model) => (
              <SelectItem
                key={encodeModelValue(provider.providerId, model.id)}
                value={encodeModelValue(provider.providerId, model.id)}
              >
                {provider.providerName} / {model.name}
              </SelectItem>
            ))}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

function AgentSubAgentsConfig({ agentId }: { agentId: string }) {
  const { data: linked } = useSuspenseQuery(agentSubAgentsQueryOptions(agentId));
  const { data: allAgents } = useSuspenseQuery(agentsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const addSubAgent = useAddSubAgentToAgent();
  const removeSubAgent = useRemoveSubAgentFromAgent();

  const linkedIds = new Set(linked.map((a) => a.id));
  const available = allAgents.filter(
    (a) => a.type === 'sub' && !linkedIds.has(a.id) && a.id !== agentId,
  );

  const handleAdd = async (agent: Agent) => {
    try {
      await addSubAgent.mutateAsync({ agentId, subAgentId: agent.id });
      toast.success(`${agent.name} added as sub-agent`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add sub-agent');
    }
  };

  const handleRemove = async (subAgent: SubAgentLink) => {
    try {
      await removeSubAgent.mutateAsync({ agentId, subAgentId: subAgent.id });
      toast.success(`${subAgent.name} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove sub-agent');
    }
  };

  return (
    <div className="space-y-4">
      {linked.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border/50">
          {linked.map((subAgent) => (
            <div
              key={subAgent.id}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{subAgent.name}</p>
                  {subAgent.systemPrompt && (
                    <p className="truncate text-xs text-muted-foreground">
                      {subAgent.systemPrompt.slice(0, 80)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SubAgentModelSelect
                  agentId={agentId}
                  subAgent={subAgent}
                  providerModels={providerModels}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleRemove(subAgent)}
                  disabled={removeSubAgent.isPending}
                  aria-label={`Remove ${subAgent.name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {linked.length === 0 && (
        <p className="text-sm text-muted-foreground">No sub-agents assigned to this agent.</p>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Add sub-agent</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {available.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    {agent.systemPrompt && (
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.systemPrompt.slice(0, 80)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleAdd(agent)}
                  disabled={addSubAgent.isPending}
                  aria-label={`Add ${agent.name}`}
                  className="shrink-0"
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {available.length === 0 && linked.length > 0 && (
        <p className="text-xs text-muted-foreground">All available sub-agents are assigned.</p>
      )}

      {allAgents.filter((a) => a.type === 'sub').length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sub-agents exist. Create one using the &ldquo;+ Sub Agent&rdquo; button in the agents
          list.
        </p>
      )}
    </div>
  );
}

function AgentEditor({ mode, onBack }: { mode: AgentEditorMode; onBack: () => void }) {
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const agentType = mode.type === 'edit' ? mode.agent.type : mode.agentType;

  const [form, setForm] = React.useState<AgentFormState>(() =>
    mode.type === 'edit'
      ? toFormState(mode.agent)
      : { name: '', useBasePrompt: true, systemPrompt: '' },
  );

  const isPending = createAgent.isPending || updateAgent.isPending;

  const handleSave = async () => {
    const name = form.name.trim();
    if (name.length === 0) {
      toast.error('Agent name is required');
      return;
    }

    if (!form.useBasePrompt && form.systemPrompt.trim().length === 0) {
      toast.error('System prompt is required when base prompt is disabled');
      return;
    }

    try {
      if (mode.type === 'create') {
        await createAgent.mutateAsync({
          name,
          type: mode.agentType,
          useBasePrompt: form.useBasePrompt,
          systemPrompt: form.useBasePrompt ? null : form.systemPrompt,
        });
        toast.success(mode.agentType === 'sub' ? 'Sub-agent created' : 'Agent created');
      } else {
        await updateAgent.mutateAsync({
          id: mode.agent.id,
          name,
          useBasePrompt: form.useBasePrompt,
          systemPrompt: form.useBasePrompt ? null : form.systemPrompt,
        });
        toast.success('Agent updated');
      }

      onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save agent');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to agents">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">
              {mode.type === 'create'
                ? agentType === 'sub'
                  ? 'Add Sub Agent'
                  : 'Add Agent'
                : 'Edit Agent'}
            </h2>
            {agentType === 'sub' && <Badge variant="outline">Sub Agent</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode.type === 'create'
              ? agentType === 'sub'
                ? 'Create a new sub-agent that can be assigned to primary agents'
                : 'Create a new primary agent'
              : 'Update agent configuration and prompt behavior'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          {mode.type === 'edit' && <TabsTrigger value="tools">Tools</TabsTrigger>}
          {mode.type === 'edit' && <TabsTrigger value="mcp">MCP Servers</TabsTrigger>}
          {mode.type === 'edit' && agentType === 'primary' && (
            <TabsTrigger value="sub-agents">Sub Agents</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Agent name"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Use base prompt</p>
                <p className="text-xs text-muted-foreground">
                  Use the default system prompt for this agent
                </p>
              </div>
              <Switch
                checked={form.useBasePrompt}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, useBasePrompt: checked }))
                }
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">System prompt</p>
              <Textarea
                value={form.systemPrompt}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    systemPrompt: event.target.value,
                  }))
                }
                placeholder="Custom system prompt"
                className="min-h-36"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={isPending}>
                {isPending ? 'Saving...' : mode.type === 'create' ? 'Create agent' : 'Save changes'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {mode.type === 'edit' && (
          <TabsContent value="tools">
            <React.Suspense
              fallback={<div className="text-xs text-muted-foreground">Loading tools...</div>}
            >
              <AgentToolConfig agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}

        {mode.type === 'edit' && (
          <TabsContent value="mcp">
            <React.Suspense
              fallback={<div className="text-xs text-muted-foreground">Loading...</div>}
            >
              <AgentMcpServers agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}

        {mode.type === 'edit' && agentType === 'primary' && (
          <TabsContent value="sub-agents">
            <React.Suspense
              fallback={<div className="text-xs text-muted-foreground">Loading...</div>}
            >
              <AgentSubAgentsConfig agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AgentsList({
  onEdit,
  onCreate,
}: {
  onEdit: (agent: Agent) => void;
  onCreate: (agentType: AgentType) => void;
}) {
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const deleteAgent = useDeleteAgent();
  const setDefaultAgent = useSetDefaultAgent();

  const defaultAgentId = settings['agent.default'];

  const primaryAgents = agents.filter((a) => a.type === 'primary');
  const subAgents = agents.filter((a) => a.type === 'sub');

  const handleDelete = async (agent: Agent) => {
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success('Agent deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent');
    }
  };

  const handleSetDefault = async (agent: Agent) => {
    try {
      await setDefaultAgent.mutateAsync(agent.id);
      toast.success(`${agent.name} set as default`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set default agent');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Agents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage primary agents, sub-agents, and prompt settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onCreate('sub')}>
            <PlusIcon className="mr-1 size-3.5" />
            Sub Agent
          </Button>
          <Button size="sm" onClick={() => onCreate('primary')}>
            <PlusIcon className="mr-1 size-3.5" />
            Agent
          </Button>
        </div>
      </div>

      {/* Primary Agents */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Primary Agents</p>
        <div className="overflow-hidden rounded-lg border border-border/60">
          {primaryAgents.length === 0 && (
            <p className="px-4 py-5 text-sm text-muted-foreground">No primary agents found.</p>
          )}

          {primaryAgents.map((agent) => {
            const isDefault = agent.id === defaultAgentId;
            return (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{agent.name}</p>
                  {isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {!isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleSetDefault(agent)}
                      disabled={setDefaultAgent.isPending}
                    >
                      Make default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onEdit(agent)}>
                    Edit
                  </Button>
                  {agent.isDeletable && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void handleDelete(agent)}
                      disabled={deleteAgent.isPending}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub Agents */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Sub Agents</p>
        <div className="overflow-hidden rounded-lg border border-border/60">
          {subAgents.length === 0 && (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              No sub-agents yet. Create one to assign to primary agents.
            </p>
          )}

          {subAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <BotIcon className="size-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">{agent.name}</p>
                <Badge variant="outline">Sub</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(agent)}>
                  Edit
                </Button>
                {agent.isDeletable && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDelete(agent)}
                    disabled={deleteAgent.isPending}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentsContent() {
  const [mode, setMode] = React.useState<AgentEditorMode | null>(null);

  if (mode) {
    return <AgentEditor mode={mode} onBack={() => setMode(null)} />;
  }

  return (
    <AgentsList
      onCreate={(agentType) => setMode({ type: 'create', agentType })}
      onEdit={(agent) => setMode({ type: 'edit', agent })}
    />
  );
}

export function AgentsSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <AgentsContent />
    </React.Suspense>
  );
}
