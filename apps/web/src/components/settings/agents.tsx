import { ArrowLeftIcon, PlusIcon, SearchIcon, ServerIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';
import type { McpServer } from '@stitch/shared/mcp/types';
import { parseMcpToolName } from '@stitch/shared/mcp/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  agentMcpServersQueryOptions,
  agentToolConfigQueryOptions,
  agentsQueryOptions,
  useAddMcpServerToAgent,
  useCreateAgent,
  useDeleteAgent,
  useRemoveMcpServerFromAgent,
  useSetAgentToolEnabled,
  useSetDefaultAgent,
  useUpdateAgent,
} from '@/lib/queries/agents';
import { mcpServersQueryOptions } from '@/lib/queries/mcp';
import { settingsQueryOptions } from '@/lib/queries/settings';

type AgentEditorMode =
  | { type: 'create' }
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

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: 'Bash',
  read: 'Read',
  edit: 'Edit',
  write: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  webfetch: 'Web Fetch',
  question: 'Question',
};

function AgentToolConfig({ agentId }: { agentId: string }) {
  const { data: toolConfig } = useSuspenseQuery(agentToolConfigQueryOptions(agentId));
  const { data: linkedServers } = useSuspenseQuery(agentMcpServersQueryOptions(agentId));
  const setToolEnabled = useSetAgentToolEnabled();
  const [search, setSearch] = React.useState('');

  const serverNameMap = new Map(linkedServers.map((s) => [s.id as string, s.name]));

  const query = search.trim().toLowerCase();

  const stitchTools = toolConfig.filter(
    (t) =>
      t.toolType === 'stitch' &&
      (query === '' ||
        (TOOL_DISPLAY_NAMES[t.toolName] ?? t.toolName).toLowerCase().includes(query)),
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

  const handleToggle = (toolType: 'stitch' | 'mcp', toolName: string, enabled: boolean) => {
    void setToolEnabled
      .mutateAsync({ agentId, toolType, toolName, enabled })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update tool');
      });
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
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
            {stitchTools.map((tool) => (
              <div
                key={tool.toolName}
                className="flex items-center justify-between border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <p className="text-sm">{TOOL_DISPLAY_NAMES[tool.toolName] ?? tool.toolName}</p>
                <Switch
                  checked={tool.enabled}
                  onCheckedChange={(checked) => handleToggle('stitch', tool.toolName, checked)}
                  disabled={setToolEnabled.isPending}
                />
              </div>
            ))}
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
              return (
                <div
                  key={tool.toolName}
                  className="flex items-center justify-between border-b border-border/40 px-3 py-2 last:border-b-0"
                >
                  <p className="text-sm font-mono">{parsed?.toolName ?? tool.toolName}</p>
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={(checked) => handleToggle('mcp', tool.toolName, checked)}
                    disabled={setToolEnabled.isPending}
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

function AgentEditor({ mode, onBack }: { mode: AgentEditorMode; onBack: () => void }) {
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

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
          useBasePrompt: form.useBasePrompt,
          systemPrompt: form.useBasePrompt ? null : form.systemPrompt,
        });
        toast.success('Agent created');
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
          <h2 className="text-base font-bold">
            {mode.type === 'create' ? 'Add Agent' : 'Edit Agent'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode.type === 'create'
              ? 'Create a new primary agent'
              : 'Update agent configuration and prompt behavior'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          {mode.type === 'edit' && <TabsTrigger value="tools">Tools</TabsTrigger>}
          {mode.type === 'edit' && <TabsTrigger value="mcp">MCP Servers</TabsTrigger>}
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
      </Tabs>
    </div>
  );
}

function AgentsList({
  onEdit,
  onCreate,
}: {
  onEdit: (agent: Agent) => void;
  onCreate: () => void;
}) {
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const deleteAgent = useDeleteAgent();
  const setDefaultAgent = useSetDefaultAgent();

  const defaultAgentId = settings['agent.default'];

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
            Manage primary agents and prompt settings
          </p>
        </div>
        <Button size="icon-sm" onClick={onCreate} aria-label="Add agent">
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {agents.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">No agents found.</p>
        )}

        {agents.map((agent) => {
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
  );
}

function AgentsContent() {
  const [mode, setMode] = React.useState<AgentEditorMode | null>(null);

  if (mode) {
    return <AgentEditor mode={mode} onBack={() => setMode(null)} />;
  }

  return (
    <AgentsList
      onCreate={() => setMode({ type: 'create' })}
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
