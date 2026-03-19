import { ArrowLeftIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  agentsQueryOptions,
  useCreateAgent,
  useDeleteAgent,
  useUpdateAgent,
} from '@/lib/queries/agents';

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
          <h2 className="text-base font-bold">{mode.type === 'create' ? 'Add Agent' : 'Edit Agent'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode.type === 'create'
              ? 'Create a new primary agent'
              : 'Update agent configuration and prompt behavior'}
          </p>
        </div>
      </div>

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
            <p className="text-xs text-muted-foreground">Use the default system prompt for this agent</p>
          </div>
          <Switch
            checked={form.useBasePrompt}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, useBasePrompt: checked }))}
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
    </div>
  );
}

function AgentsList({ onEdit, onCreate }: { onEdit: (agent: Agent) => void; onCreate: () => void }) {
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const deleteAgent = useDeleteAgent();

  const handleDelete = async (agent: Agent) => {
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success('Agent deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Agents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage primary agents and prompt settings</p>
        </div>
        <Button size="icon-sm" onClick={onCreate} aria-label="Add agent">
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {agents.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">No agents found.</p>
        )}

        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
          >
            <p className="text-sm font-medium">{agent.name}</p>
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
  );
}

function AgentsContent() {
  const [mode, setMode] = React.useState<AgentEditorMode | null>(null);

  if (mode) {
    return <AgentEditor mode={mode} onBack={() => setMode(null)} />;
  }

  return (
    <AgentsList onCreate={() => setMode({ type: 'create' })} onEdit={(agent) => setMode({ type: 'edit', agent })} />
  );
}

export function AgentsSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <AgentsContent />
    </React.Suspense>
  );
}
