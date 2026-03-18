import type { PrefixedString } from './id.js';
import type { LanguageModelV3Source } from '@ai-sdk/provider';
import type { TextStreamPart, ToolSet, LanguageModelUsage } from 'ai';

export type { LanguageModelV3Source, LanguageModelUsage, TextStreamPart, ToolSet };
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type PartId = PrefixedString<'prt'>;

// ─── Stream part types (derived from SDK, used in SSE payloads) ───────────────

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

export type StepStartPart = {
  type: 'step-start';
  step: number;
};

export type StepFinishPart = {
  type: 'step-finish';
  step: number;
  finishReason: string;
  usage: LanguageModelUsage;
};

export type CompactionPart = {
  type: 'compaction';
  auto: boolean;
  overflow?: boolean;
};

export type SessionTitlePart = {
  type: 'session-title';
  title: string;
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
  | StepStartPart
  | StepFinishPart
  | CompactionPart
  | SessionTitlePart;

export type StoredPart = AllPart & { id: PartId; startedAt: number; endedAt: number };

export type Message = {
  id: PrefixedString<'msg'>;
  sessionId: PrefixedString<'ses'>;
  role: MessageRole;
  parts: StoredPart[];
  modelId: string;
  providerId: string;
  agentId: PrefixedString<'agt'>;
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
  createdAt: number;
  updatedAt: number;
};

export type SessionWithMessages = Session & { messages: Message[] };

export type MessagesPage = {
  messages: Message[];
  hasMore: boolean;
};
