import type { StreamErrorDetails } from '../chat/errors.js';
import type { PrefixedString } from '../id/index.js';
import type { LanguageModelV3Source } from '@ai-sdk/provider';
import type { LanguageModelUsage, TextStreamPart, ToolSet } from 'ai';

export type { LanguageModelV3Source, LanguageModelUsage };

const MESSAGE_ROLES = ['user', 'assistant', 'system', 'tool'] as const;

export const ARCHIVE_REASONS = {
  archiveSession: 'archive_session',
  automationDeleted: 'automation_deleted',
  redo: 'redo',
} as const;

export type ArchiveReason = (typeof ARCHIVE_REASONS)[keyof typeof ARCHIVE_REASONS];

type UserImagePart = { type: 'user-image'; dataUrl: string; mime: string; filename: string };

type UserFilePart = { type: 'user-file'; dataUrl: string; mime: string; filename: string };

type UserTextFilePart = { type: 'user-text-file'; content: string; mime: string; filename: string };

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export type PartId = PrefixedString<'prt'>;

type FullStreamPart = TextStreamPart<ToolSet>;

export type TextStartPart = Extract<FullStreamPart, { type: 'text-start' }>;
export type TextDeltaPart = Extract<FullStreamPart, { type: 'text-delta' }>;
export type TextEndPart = Extract<FullStreamPart, { type: 'text-end' }>;
export type ReasoningStartPart = Extract<FullStreamPart, { type: 'reasoning-start' }>;
export type ReasoningDeltaPart = Extract<FullStreamPart, { type: 'reasoning-delta' }>;
export type ReasoningEndPart = Extract<FullStreamPart, { type: 'reasoning-end' }>;
export type SourceStreamPart = Extract<FullStreamPart, { type: 'source' }>;
export type FileStreamPart = Extract<FullStreamPart, { type: 'file' }>;
export type ToolCallStreamPart = Extract<FullStreamPart, { type: 'tool-call' }>;
export type ToolResultStreamPart = Extract<FullStreamPart, { type: 'tool-result' }> & {
  truncated: boolean;
  outputPath?: string;
};
type CompactionPart = { type: 'compaction'; auto: boolean; overflow?: boolean };

type SessionTitlePart = { type: 'session-title'; title: string };

type StreamErrorPart = { type: 'stream.error'; error: string; details?: StreamErrorDetails };

type AutomationGenerationPart = {
  type: 'automation-generation';
  title: string;
  toolsets: string[];
  steps: string[];
  prompt: string;
  providerId: string;
  modelId: string;
};

type AllPart =
  | TextStartPart
  | TextDeltaPart
  | TextEndPart
  | ReasoningStartPart
  | ReasoningDeltaPart
  | ReasoningEndPart
  | SourceStreamPart
  | FileStreamPart
  | ToolCallStreamPart
  | ToolResultStreamPart
  | CompactionPart
  | SessionTitlePart
  | StreamErrorPart
  | AutomationGenerationPart
  | UserImagePart
  | UserFilePart
  | UserTextFilePart;

export type StoredPart = AllPart & { id: PartId; startedAt: number; endedAt: number };

export type Message = {
  id: PrefixedString<'msg'>;
  sessionId: PrefixedString<'ses'>;
  role: MessageRole;
  parts: StoredPart[];
  modelId: string;
  providerId: string;
  usage: LanguageModelUsage;
  costUsd: number | null;
  finishReason: string;
  isSummary: boolean;
  archivedAt: number | null;
  archivedReason: ArchiveReason | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number;
  duration: number | null;
};

export type Session = {
  id: PrefixedString<'ses'>;
  title: string | null;
  type: 'chat' | 'automation';
  automationId: PrefixedString<'auto'> | null;
  parentSessionId: PrefixedString<'ses'> | null;
  isUnread: boolean;
  archivedAt: number | null;
  archivedReason: ArchiveReason | null;
  createdAt: number;
  updatedAt: number;
};

export type MessagesPage = { messages: Message[]; hasMore: boolean };

export type SessionsPage = { sessions: Session[]; hasMore: boolean };

export type SessionStats = {
  sessionTitle: string;
  providerLabel: string;
  modelLabel: string;
  contextLimit: number | null;
  messagesCount: number;
  usagePercent: string;
  totalTokens: number;
  currentSessionTokens: number;
  childSessionsTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalCostUsd: number;
  currentSessionCostUsd: number;
  childSessionsCostUsd: number;
  sessionCreatedAt: number | null;
  lastActivityAt: number | null;
};
