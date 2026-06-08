import type { PrefixedString } from '../id/index.js';
import type { PermissionResponse } from '../permissions/types.js';
import type { QuestionRequest } from '../questions/types.js';
import type { MeetingKind, MeetingPlatform, RecordingAnalysisStatus } from '../recordings/types.js';
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

export type SessionTodosUpdatedPayload = {
  sessionId: PrefixedString<'ses'>;
};

export type MeetingCallDetectedPayload = {
  key: string;
  platform: MeetingPlatform;
  kind: MeetingKind;
  displayName: string;
  processNames: string[];
  windowTitle: string | null;
  detectedAt: number;
};

export type MeetingCallEndedPayload = {
  key: string;
  endedAt: number;
};

export type RecordingAnalysisUpdatedPayload = {
  recordingId: PrefixedString<'rec'>;
  status: RecordingAnalysisStatus;
  title: string | null;
};

export type RecordingWarningPayload = {
  code: string;
  message: string;
};

export type RecordingDeviceChangedPayload = {
  kind: 'input' | 'output' | 'list';
  deviceName: string | null;
};

export type RecordingTranscriptEntryPayload = {
  recordingId: string;
  kind: 'partial' | 'final';
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
};

export const SSE_EVENT_NAMES = [
  'heartbeat',
  'connected',
  'data-change',
  'session-title-update',
  'stream-start',
  'stream-part-update',
  'stream-part-delta',
  'stream-finish',
  'stream-error',
  'stream-retry',
  'stream-tool-state',
  'doom-loop-detected',
  'compaction-start',
  'compaction-complete',
  'question-asked',
  'question-replied',
  'question-rejected',
  'permission-response-requested',
  'permission-response-resolved',
  'session-todos-updated',
  'recording-analysis-updated',
  'recording-transcript-entry',
] as const;

export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export type SseEventPayloadMap = {
  heartbeat: { ts: number };
  connected: { ts: number };
  'data-change': DataChangePayload;
  'session-title-update': SessionTitleUpdatePayload;
  'stream-start': StreamStartPayload;
  'stream-part-update': StreamPartUpdatePayload;
  'stream-part-delta': StreamPartDeltaPayload;
  'stream-finish': StreamFinishPayload;
  'stream-error': StreamErrorPayload;
  'stream-retry': StreamRetryPayload;
  'stream-tool-state': StreamToolStatePayload;
  'doom-loop-detected': DoomLoopDetectedPayload;
  'compaction-start': CompactionStartPayload;
  'compaction-complete': CompactionCompletePayload;
  'question-asked': QuestionAskedPayload;
  'question-replied': QuestionRepliedPayload;
  'question-rejected': QuestionRejectedPayload;
  'permission-response-requested': PermissionResponseRequestedPayload;
  'permission-response-resolved': PermissionResponseResolvedPayload;
  'session-todos-updated': SessionTodosUpdatedPayload;
  'recording-analysis-updated': RecordingAnalysisUpdatedPayload;
  'recording-transcript-entry': RecordingTranscriptEntryPayload;
};

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventPayloadMap[K]) => void;
};

export type UseSseResult = {
  isConnected: boolean;
  lastHeartbeat: Date | null;
};
