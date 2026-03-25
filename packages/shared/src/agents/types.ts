import type { PrefixedString } from '../id/index.js';

export const AGENT_TYPES = ['primary', 'sub'] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_KINDS = ['primary', 'meetings'] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export const AGENT_TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type AgentToolType = (typeof AGENT_TOOL_TYPES)[number];

export type Agent = {
  id: PrefixedString<'agt'>;
  name: string;
  type: AgentType;
  kind: AgentKind | null;
  isDeletable: boolean;
  systemPrompt: string | null;
  useBasePrompt: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AgentToolEntry = {
  toolType: AgentToolType;
  toolName: string;
  displayName: string;
  enabled: boolean;
};

export type AgentSubAgent = {
  id: PrefixedString<'agtsub'>;
  agentId: PrefixedString<'agt'>;
  subAgentId: PrefixedString<'agt'>;
  providerId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
};
