export type PermissionDecision = 'allow' | 'reject' | 'alternative';

export type PermissionResponseStatus = 'pending' | 'allowed' | 'rejected' | 'alternative';

export type PermissionResponse = {
  id: string;
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
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
