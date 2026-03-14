import type { LanguageModelV3Source } from '@ai-sdk/provider';
import type { TextStreamPart, ToolSet, LanguageModelUsage } from 'ai';

export type { LanguageModelV3Source, LanguageModelUsage, TextStreamPart, ToolSet };
export type MessageRole = 'user' | 'assistant';

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
export type ToolResultStreamPart = Extract<FullStreamPart, { type: 'tool-result' }>;
export type ToolInputStartPart = Extract<FullStreamPart, { type: 'tool-input-start' }>;
export type ToolInputDeltaPart = Extract<FullStreamPart, { type: 'tool-input-delta' }>;
export type ToolInputEndPart = Extract<FullStreamPart, { type: 'tool-input-end' }>;
export type ToolErrorPart = Extract<FullStreamPart, { type: 'tool-error' }>;
export type FinishStreamPart = Extract<FullStreamPart, { type: 'finish' }>;


export type StepStartPart = {
  type: 'step-start';
  step: number;
  startedAt: number;
  endedAt: number;
};

export type StepFinishPart = {
  type: 'step-finish';
  step: number;
  finishReason: string;
  usage: LanguageModelUsage;
  startedAt: number;
  endedAt: number;
};

type Timestamped<T> = T & { startedAt: number; endedAt: number };

export type StoredPart =
  | Timestamped<TextStartPart>
  | Timestamped<TextDeltaPart>
  | Timestamped<TextEndPart>
  | Timestamped<ReasoningStartPart>
  | Timestamped<ReasoningDeltaPart>
  | Timestamped<ReasoningEndPart>
  | Timestamped<SourceStreamPart>
  | Timestamped<FileStreamPart>
  | Timestamped<ToolCallStreamPart>
  | Timestamped<ToolResultStreamPart>
  | StepStartPart
  | StepFinishPart;


export type Message = {
  id: string;
  sessionId: string;
  role: MessageRole;
  parts: StoredPart[];
  model: string;
  usage: LanguageModelUsage;
  finishReason: string;
  createdAt: number;
  updatedAt: number;
  startedAt: number;
  duration: number | null;
};

export type Session = {
  id: string;
  title: string | null;
  parentSessionId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SessionWithMessages = Session & { messages: Message[] };
