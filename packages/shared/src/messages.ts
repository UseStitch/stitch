import type { LanguageModelV3Source } from '@ai-sdk/provider';
import type { TextStreamPart, ToolSet, LanguageModelUsage } from 'ai';

export type { LanguageModelV3Source, LanguageModelUsage, TextStreamPart, ToolSet };
export type MessageRole = 'user' | 'assistant';

/** An SDK stream part enriched with wall-clock timestamps (ms since epoch). */
export type StoredPart = TextStreamPart<ToolSet> & {
  startedAt: number;
  endedAt: number;
};

export type Message = {
  id: string;
  sessionId: string;
  role: MessageRole;
  parts: StoredPart[];
  model: string;
  usage: LanguageModelUsage;
  finishReason: string;
  createdAt: number;
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

// ─── Stream part types (derived from SDK, used in SSE payloads) ───────────────

type FullStreamPart = TextStreamPart<ToolSet>;

export type TextStartPart        = Extract<FullStreamPart, { type: 'text-start' }>;
export type TextDeltaPart        = Extract<FullStreamPart, { type: 'text-delta' }>;
export type TextEndPart          = Extract<FullStreamPart, { type: 'text-end' }>;
export type ReasoningStartPart   = Extract<FullStreamPart, { type: 'reasoning-start' }>;
export type ReasoningDeltaPart   = Extract<FullStreamPart, { type: 'reasoning-delta' }>;
export type ReasoningEndPart     = Extract<FullStreamPart, { type: 'reasoning-end' }>;
export type SourceStreamPart     = Extract<FullStreamPart, { type: 'source' }>;
export type FileStreamPart       = Extract<FullStreamPart, { type: 'file' }>;
export type ToolCallStreamPart   = Extract<FullStreamPart, { type: 'tool-call' }>;
export type ToolResultStreamPart = Extract<FullStreamPart, { type: 'tool-result' }>;
export type FinishStreamPart     = Extract<FullStreamPart, { type: 'finish' }>;
