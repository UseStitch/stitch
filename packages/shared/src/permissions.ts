export type PermissionDecision = 'allow' | 'reject' | 'alternative';

export type AgentPermissionValue = 'allow' | 'deny' | 'ask';

export type PermissionSuggestion = {
  message: string;
  pattern: string;
};

export type AgentPermission = {
  id: string;
  agentId: string;
  toolName: string;
  pattern: string | null;
  permission: AgentPermissionValue;
  createdAt: Date;
  updatedAt: Date;
};

export type PermissionResponseStatus = 'pending' | 'allowed' | 'rejected' | 'alternative';

export type PermissionResponse = {
  id: string;
  sessionId: string;
  messageId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
  suggestion: PermissionSuggestion | null;
  status: PermissionResponseStatus;
  entry: string | null;
  createdAt: Date;
  resolvedAt?: Date;
};

export type PermissionAllow = Record<string, never>;

export type PermissionReject = Record<string, never>;

export type PermissionAlternative = {
  entry: string;
};

export type PermissionDecisionResult = {
  decision: PermissionDecision;
  entry?: string;
};
