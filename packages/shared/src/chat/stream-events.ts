import type { PrefixedString } from '../id/index.js';
import type { StreamErrorDetails } from './errors.js';
import type {
  FileStreamPart,
  ReasoningDeltaPart,
  ReasoningEndPart,
  ReasoningStartPart,
  SourceStreamPart,
  TextDeltaPart,
  TextEndPart,
  TextStartPart,
  ToolCallStreamPart,
  ToolResultStreamPart,
} from './messages.js';
import type { LanguageModelUsage } from 'ai';

export type ToolCallStatus = 'pending' | 'in-progress' | 'completed' | 'error';

export type StreamToolStatePayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type PartUpdate =
  | TextStartPart
  | TextEndPart
  | ReasoningStartPart
  | ReasoningEndPart
  | ToolCallStreamPart
  | ToolResultStreamPart
  | SourceStreamPart
  | FileStreamPart;

export type StreamPartUpdatePayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  partId: PrefixedString<'prt'>;
  part: PartUpdate;
};

export type PartDelta = TextDeltaPart | ReasoningDeltaPart;

export type StreamPartDeltaPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  partId: PrefixedString<'prt'>;
  delta: PartDelta;
};

export type StreamFinishPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  finishReason: string;
  usage?: LanguageModelUsage;
};

export type StreamErrorPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  error: string;
  details?: StreamErrorDetails;
};

export type StreamRetryPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  message: string;
};

export type StreamStartPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type DoomLoopDetectedPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolName: string;
  consecutiveCount: number;
};

export const STREAM_EVENT_NAMES = [
  'stream-start',
  'stream-part-update',
  'stream-part-delta',
  'stream-finish',
  'stream-error',
  'stream-retry',
  'stream-tool-state',
  'doom-loop-detected',
] as const;

export type StreamEvents = {
  'stream-start': StreamStartPayload;
  'stream-part-update': StreamPartUpdatePayload;
  'stream-part-delta': StreamPartDeltaPayload;
  'stream-finish': StreamFinishPayload;
  'stream-error': StreamErrorPayload;
  'stream-retry': StreamRetryPayload;
  'stream-tool-state': StreamToolStatePayload;
  'doom-loop-detected': DoomLoopDetectedPayload;
};
