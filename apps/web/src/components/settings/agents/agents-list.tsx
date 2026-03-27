import { BotIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';
import type { AgentType } from '@stitch/shared/agents/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { agentsQueryOptions, useDeleteAgent, useSetDefaultAgent } from '@/lib/queries/agents';
import { settingsQueryOptions } from '@/lib/queries/settings';

type AgentsListProps = {
  onEdit: (agent: Agent) => void;
  onCreate: (agentType: AgentType) => void;
};

export function AgentsList({ onEdit, onCreate }: AgentsListProps) {
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const deleteAgent = useDeleteAgent();
  const setDefaultAgent = useSetDefaultAgent();

  const defaultAgentId = settings['agent.default'];

  const primaryAgents = agents.filter((agent) => agent.type === 'primary');
  const subAgents = agents.filter((agent) => agent.type === 'sub');

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
