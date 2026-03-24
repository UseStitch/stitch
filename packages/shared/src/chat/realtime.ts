import type { PrefixedString } from '../id/index.js';
import type { PermissionResponse } from '../permissions/types.js';
import type { QuestionRequest } from '../questions/types.js';
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

export type StreamToolInputDeltaPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  inputTextDelta: string;
};

export type DataChangePayload = {
  queryKey: readonly unknown[];
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

export type SessionTitleUpdatePayload = {
  sessionId: PrefixedString<'ses'>;
  title: string;
};

export type DoomLoopDetectedPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolName: string;
  consecutiveCount: number;
};

export type StepStartPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  step: number;
};

export type StepFinishPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  step: number;
  finishReason: string;
  usage: LanguageModelUsage;
};

export type CompactionStartPayload = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type CompactionCompletePayload = {
  sessionId: PrefixedString<'ses'>;
  summaryMessageId: PrefixedString<'msg'>;
};

export type QuestionAskedPayload = {
  question: QuestionRequest;
};

export type QuestionRepliedPayload = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  answers: string[][];
};

export type QuestionRejectedPayload = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
};

export type PermissionResponseRequestedPayload = {
  permissionResponse: PermissionResponse;
};

export type PermissionResponseResolvedPayload = {
  permissionResponseId: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
};

export type MeetingDetectedPayload = {
  meetingId: PrefixedString<'rec'>;
  app: string;
  startedAt: number;
};

export type MeetingRecordingFinishedPayload = {
  meetingId: PrefixedString<'rec'>;
  app: string;
  durationSecs: number;
};

export type MeetingEndedPayload = {
  meetingId: PrefixedString<'rec'>;
};

export type SseEventPayloadMap = {
  heartbeat: { ts: number };
  connected: Record<string, never>;
  'data-change': DataChangePayload;
  'session-title-update': SessionTitleUpdatePayload;
  'stream-start': StreamStartPayload;
  'stream-part-update': StreamPartUpdatePayload;
  'stream-part-delta': StreamPartDeltaPayload;
  'stream-finish': StreamFinishPayload;
  'stream-error': StreamErrorPayload;
  'stream-retry': StreamRetryPayload;
  'stream-tool-state': StreamToolStatePayload;
  'stream-tool-input-delta': StreamToolInputDeltaPayload;
  'step-start': StepStartPayload;
  'step-finish': StepFinishPayload;
  'doom-loop-detected': DoomLoopDetectedPayload;
  'compaction-start': CompactionStartPayload;
  'compaction-complete': CompactionCompletePayload;
  'question-asked': QuestionAskedPayload;
  'question-replied': QuestionRepliedPayload;
  'question-rejected': QuestionRejectedPayload;
  'permission-response-requested': PermissionResponseRequestedPayload;
  'permission-response-resolved': PermissionResponseResolvedPayload;
  'meeting-detected': MeetingDetectedPayload;
  'meeting-recording-finished': MeetingRecordingFinishedPayload;
  'meeting-ended': MeetingEndedPayload;
};

export type SseEventName = keyof SseEventPayloadMap;

export type SseEvent = {
  event: SseEventName;
  data: string;
};

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventPayloadMap[K]) => void;
};

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};
