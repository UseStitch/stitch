import type { LanguageModelUsage } from 'ai';
import type {
  ReasoningDeltaPart,
  ReasoningEndPart,
  ReasoningStartPart,
  SourceStreamPart,
  FileStreamPart,
  TextDeltaPart,
  TextEndPart,
  TextStartPart,
  ToolCallStreamPart,
  ToolResultStreamPart,
} from './messages.js';

export type SseEventName =
  | 'heartbeat'
  | 'connected'
  | 'data-change'
  | 'stream-start'
  | 'stream-part-update'
  | 'stream-part-delta'
  | 'stream-finish'
  | 'stream-error';

export type SseEvent = {
  event: SseEventName;
  data: string;
};

export type SseHandlers = Partial<Record<SseEventName, (data: unknown) => void>>;

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};

export type DataChangePayload = {
  queryKey: readonly unknown[];
};

// ─── Stream part update ───────────────────────────────────────────────────────
// Sent when a part is created (text-start, reasoning-start) or completed
// (text-end, reasoning-end, tool-call, tool-result, source, file).

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
  sessionId: string;
  messageId: string;
  partId: string;
  part: PartUpdate;
};

// ─── Stream part delta ────────────────────────────────────────────────────────
// Sent for each incremental chunk (text-delta, reasoning-delta).

export type PartDelta = TextDeltaPart | ReasoningDeltaPart;

export type StreamPartDeltaPayload = {
  sessionId: string;
  messageId: string;
  partId: string;
  delta: PartDelta;
};

// ─── Stream finish / error ────────────────────────────────────────────────────

export type StreamFinishPayload = {
  sessionId: string;
  messageId: string;
  finishReason: string;
  usage?: LanguageModelUsage;
};

export type StreamErrorPayload = {
  sessionId: string;
  messageId: string;
  error: string;
};

export type StreamStartPayload = {
  sessionId: string;
  messageId: string;
};
