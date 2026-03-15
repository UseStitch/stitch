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
import type { QuestionRequest } from './questions.js';

export type SseEventName =
  | 'heartbeat'
  | 'connected'
  | 'data-change'
  | 'session-title-update'
  | 'stream-start'
  | 'stream-part-update'
  | 'stream-part-delta'
  | 'stream-finish'
  | 'stream-error'
  | 'stream-retry'
  | 'stream-tool-state'
  | 'stream-tool-input-delta'
  | 'step-start'
  | 'step-finish'
  | 'doom-loop-detected'
  | 'compaction-start'
  | 'compaction-complete'
  | 'question-asked'
  | 'question-replied'
  | 'question-rejected';

// ─── Tool call lifecycle ──────────────────────────────────────────────────────

export type ToolCallStatus = 'pending' | 'in-progress' | 'completed' | 'error';

/**
 * Broadcast whenever a tool call transitions state.
 * - pending:     LLM started generating args (tool-input-start)
 * - in-progress: Args validated, execution started
 * - completed:   Execution succeeded, output available
 * - error:       Validation failed or execution threw — error details available
 */
export type StreamToolStatePayload = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
};

/** Streamed tool argument chunk while the LLM is generating them. */
export type StreamToolInputDeltaPayload = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  inputTextDelta: string;
};

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

export type StreamRetryPayload = {
  sessionId: string;
  messageId: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  message: string;
};

export type StreamStartPayload = {
  sessionId: string;
  messageId: string;
};

export type SessionTitleUpdatePayload = {
  sessionId: string;
  title: string;
};

export type DoomLoopDetectedPayload = {
  sessionId: string;
  messageId: string;
  toolName: string;
  consecutiveCount: number;
};

export type StepStartPayload = {
  sessionId: string;
  messageId: string;
  step: number;
};

export type StepFinishPayload = {
  sessionId: string;
  messageId: string;
  step: number;
  finishReason: string;
  usage: LanguageModelUsage;
};

// ─── Compaction events ────────────────────────────────────────────────────────

export type CompactionStartPayload = {
  sessionId: string;
  messageId: string;
};

export type CompactionCompletePayload = {
  sessionId: string;
  summaryMessageId: string;
};

// ─── Question events ──────────────────────────────────────────────────────────────

export type QuestionAskedPayload = {
  question: QuestionRequest;
};

export type QuestionRepliedPayload = {
  questionId: string;
  sessionId: string;
  answers: string[][];
};

export type QuestionRejectedPayload = {
  questionId: string;
  sessionId: string;
};
