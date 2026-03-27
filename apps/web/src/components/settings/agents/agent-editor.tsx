import { ArrowLeftIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAgent, useUpdateAgent } from '@/lib/queries/agents';

import { AgentMcpServers } from './agent-mcp-servers';
import { AgentSubAgentsConfig } from './agent-sub-agents-config';
import { AgentToolConfig } from './agent-tool-config';
import type { AgentEditorMode, AgentFormState } from './types';
import { toFormState } from './types';

type AgentEditorProps = {
  mode: AgentEditorMode;
  onBack: () => void;
};

export function AgentEditor({ mode, onBack }: AgentEditorProps) {
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
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Agent name"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Use base prompt</p>
                <p className="text-xs text-muted-foreground">Use the default system prompt for this agent</p>
              </div>
              <Switch
                checked={form.useBasePrompt}
                onCheckedChange={(checked) => setForm((previous) => ({ ...previous, useBasePrompt: checked }))}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">System prompt</p>
              <Textarea
                value={form.systemPrompt}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
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
            <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading tools...</div>}>
              <AgentToolConfig agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}

        {mode.type === 'edit' && (
          <TabsContent value="mcp">
            <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
              <AgentMcpServers agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}

        {mode.type === 'edit' && agentType === 'primary' && (
          <TabsContent value="sub-agents">
            <React.Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
              <AgentSubAgentsConfig agentId={mode.agent.id} />
            </React.Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
