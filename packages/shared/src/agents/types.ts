import type { PrefixedString } from '../id/index.js';

export const AGENT_TYPES = ['primary', 'sub'] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type AgentToolType = (typeof AGENT_TOOL_TYPES)[number];

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

export type AgentToolEntry = {
  toolType: AgentToolType;
  toolName: string;
  enabled: boolean;
};
