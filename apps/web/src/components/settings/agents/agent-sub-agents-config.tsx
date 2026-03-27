import { BotIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  agentsQueryOptions,
  type SubAgentLink,
  agentSubAgentsQueryOptions,
  useAddSubAgentToAgent,
  useRemoveSubAgentFromAgent,
  useUpdateSubAgentConfig,
} from '@/lib/queries/agents';
import { visibleProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';

import { buildModelLabel, decodeModelValue, encodeModelValue } from './model-utils';

type SubAgentModelSelectProps = {
  agentId: string;
  subAgent: SubAgentLink;
  providerModels: ProviderModels[];
};

function SubAgentModelSelect({ agentId, subAgent, providerModels }: SubAgentModelSelectProps) {
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
      return;
    }

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

type AgentSubAgentsConfigProps = {
  agentId: string;
};

export function AgentSubAgentsConfig({ agentId }: AgentSubAgentsConfigProps) {
  const { data: linked } = useSuspenseQuery(agentSubAgentsQueryOptions(agentId));
  const { data: allAgents } = useSuspenseQuery(agentsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const addSubAgent = useAddSubAgentToAgent();
  const removeSubAgent = useRemoveSubAgentFromAgent();

  const linkedIds = new Set(linked.map((agent) => agent.id));
  const available = allAgents.filter(
    (agent) => agent.type === 'sub' && !linkedIds.has(agent.id) && agent.id !== agentId,
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

      {allAgents.filter((agent) => agent.type === 'sub').length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sub-agents exist. Create one using the &ldquo;+ Sub Agent&rdquo; button in the agents
          list.
        </p>
      )}
    </div>
  );
}
