import type { StreamErrorDetails } from '../chat/errors.js';
import type { PrefixedString } from '../id/index.js';
import type { LanguageModelV3Source } from '@ai-sdk/provider';
import type { LanguageModelUsage, TextStreamPart, ToolSet } from 'ai';

export type { LanguageModelV3Source, LanguageModelUsage, TextStreamPart, ToolSet };

export const MESSAGE_ROLES = ['user', 'assistant', 'system', 'tool'] as const;

export type UserImagePart = {
  type: 'user-image';
  dataUrl: string;
  mime: string;
  filename: string;
};

export type UserFilePart = {
  type: 'user-file';
  dataUrl: string;
  mime: string;
  filename: string;
};

export type UserTextFilePart = {
  type: 'user-text-file';
  content: string;
  mime: string;
  filename: string;
};

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
export type ToolInputStartPart = Extract<FullStreamPart, { type: 'tool-input-start' }>;
export type ToolInputDeltaPart = Extract<FullStreamPart, { type: 'tool-input-delta' }>;
export type ToolInputEndPart = Extract<FullStreamPart, { type: 'tool-input-end' }>;
export type ToolErrorPart = Extract<FullStreamPart, { type: 'tool-error' }>;
export type FinishStreamPart = Extract<FullStreamPart, { type: 'finish' }>;

export type CompactionPart = {
  type: 'compaction';
  auto: boolean;
  overflow?: boolean;
};

export type SessionTitlePart = {
  type: 'session-title';
  title: string;
};

export type StreamErrorPart = {
  type: 'stream-error';
  error: string;
  details?: StreamErrorDetails;
};

export type AllPart =
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
  createdAt: number;
  updatedAt: number;
  startedAt: number;
  duration: number | null;
};

export type Session = {
  id: PrefixedString<'ses'>;
  title: string | null;
  parentSessionId: PrefixedString<'ses'> | null;
  isUnread: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SessionWithMessages = Session & { messages: Message[] };

export type MessagesPage = {
  messages: Message[];
  hasMore: boolean;
};

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
