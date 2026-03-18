import type { PrefixedString } from '../id/index.js';

export const AGENT_TYPES = ['primary', 'sub'] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type Agent = {
  id: PrefixedString<'agt'>;
  name: string;
  type: AgentType;
  isDeletable: boolean;
  systemPrompt: string | null;
  useBasePrompt: boolean;
  createdAt: number;
  updatedAt: number;
};
