import type { PrefixedString } from '../id/index.js';

export const PERMISSION_DECISIONS = ['allow', 'reject', 'alternative'] as const;

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export const TOOL_PERMISSION_VALUES = ['allow', 'deny', 'ask'] as const;

export type ToolPermissionValue = (typeof TOOL_PERMISSION_VALUES)[number];

export type PermissionSuggestion = {
  message: string;
  pattern: string;
};

export type ToolPermission = {
  id: PrefixedString<'perm'>;
  toolName: string;
  pattern: string | null;
  permission: ToolPermissionValue;
  createdAt: number;
  updatedAt: number;
};

export const PERMISSION_RESPONSE_STATUSES = [
  'pending',
  'allowed',
  'rejected',
  'alternative',
] as const;

export type PermissionResponseStatus = (typeof PERMISSION_RESPONSE_STATUSES)[number];

export type PermissionResponse = {
  id: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
  suggestion: PermissionSuggestion | null;
  status: PermissionResponseStatus;
  entry: string | null;
  createdAt: number;
  resolvedAt?: number;
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
