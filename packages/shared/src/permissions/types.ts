import type { PrefixedString } from '../id/index.js';

const PERMISSION_DECISIONS = ['allow', 'reject', 'alternative'] as const;

type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

const TOOL_PERMISSION_VALUES = ['allow', 'deny', 'ask'] as const;

export type ToolPermissionValue = (typeof TOOL_PERMISSION_VALUES)[number];

export type PermissionSuggestion = { message: string; pattern: string };

export type ToolPermission = {
  id: PrefixedString<'perm'>;
  toolName: string;
  pattern: string | null;
  permission: ToolPermissionValue;
  createdAt: number;
  updatedAt: number;
};

export type PermissionResponse = {
  id: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
  suggestion: PermissionSuggestion | null;
};

export type PermissionDecisionResult = { decision: PermissionDecision; entry?: string };
