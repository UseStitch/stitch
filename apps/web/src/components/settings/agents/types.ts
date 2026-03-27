import type { Agent } from '@stitch/shared/agents/types';
import type { AgentType } from '@stitch/shared/agents/types';

export type AgentEditorMode =
  | { type: 'create'; agentType: AgentType }
  | {
      type: 'edit';
      agent: Agent;
    };

export type AgentFormState = {
  name: string;
  useBasePrompt: boolean;
  systemPrompt: string;
};

export function toFormState(agent: Agent): AgentFormState {
  return {
    name: agent.name,
    useBasePrompt: agent.useBasePrompt,
    systemPrompt: agent.systemPrompt ?? '',
  };
}
