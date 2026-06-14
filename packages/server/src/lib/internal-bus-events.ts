import type { StreamErrorDetails } from '@stitch/shared/chat/errors';
import type { PartId, StoredPart } from '@stitch/shared/chat/messages';
import type { PartDelta, PartUpdate } from '@stitch/shared/chat/stream-events';
import type { PrefixedString } from '@stitch/shared/id';
import type { PermissionResponse } from '@stitch/shared/permissions/types';
import type { QuestionRequest } from '@stitch/shared/questions/types';

import type { LanguageModelUsage } from 'ai';

// ─── Stream Lifecycle ────────────────────────────────────────────────────────

export type StreamStartedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  streamRunId: string;
};

export type StreamStepCompletedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  providerId: string;
  modelId: string;
  step: number;
  usage: LanguageModelUsage;
  finishReason: string;
  toolCallCount: number;
  attemptCount: number;
  startedAt: number;
  durationMs: number;
};

export type StreamCompletedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  modelId: string;
  providerId: string;
  totalUsage: LanguageModelUsage;
  finishReason: string;
  durationMs: number;
  stepCount: number;
  toolCallCount: number;
  accumulatedParts: StoredPart[];
  userMessage: string | null;
  assistantMessage: string | null;
};

export type StreamFailedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  modelId: string;
  providerId: string;
  error: string;
  errorCode: string | undefined;
  details: StreamErrorDetails | undefined;
};

export type StreamAbortedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
};

// ─── Part Streaming ──────────────────────────────────────────────────────────

export type PartUpdateEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  partId: PartId;
  part: PartUpdate;
};

export type PartDeltaEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  partId: PartId;
  delta: PartDelta;
};

// ─── Tool Lifecycle ──────────────────────────────────────────────────────────

export type ToolPendingEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
};

export type ToolStartedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ToolCompletedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
};

export type ToolFailedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  error: string;
};

export type ToolProgressEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallId: string;
  toolName: string;
  output: unknown;
};

// ─── Session Lifecycle ───────────────────────────────────────────────────────

export type SessionMessageSavedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  modelId: string;
  providerId: string;
  usage: LanguageModelUsage;
  costUsd: number;
  finishReason: string;
};

export type SessionTitleUpdatedEvent = {
  sessionId: PrefixedString<'ses'>;
  title: string;
};

export type SessionTodosUpdatedEvent = {
  sessionId: PrefixedString<'ses'>;
};

export type SessionCompactionStartedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
};

export type SessionCompactionCompletedEvent = {
  sessionId: PrefixedString<'ses'>;
  summaryMessageId: PrefixedString<'msg'>;
};

// ─── Error / Recovery ────────────────────────────────────────────────────────

export type StreamRetryEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  message: string;
};

export type StreamDoomLoopDetectedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolName: string;
  consecutiveCount: number;
};

export type StreamPermissionRejectedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolName: string;
};

// ─── Usage (emitted by runner for adapter consumption) ───────────────────────

export type UsageStepFailedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  providerId: string;
  modelId: string;
  step: number;
  attempt: number;
  errorCode: string | undefined;
  isRetryable: boolean;
};

export type UsageDoomLoopFailedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  providerId: string;
  modelId: string;
  attempt: number;
  errorCode: string | undefined;
  isRetryable: boolean;
};

export type UsageDoomLoopSummaryEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  providerId: string;
  modelId: string;
  usage: LanguageModelUsage;
};

// ─── Questions ───────────────────────────────────────────────────────────────

export type QuestionAskedEvent = {
  question: QuestionRequest;
};

export type QuestionRepliedEvent = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  answers: string[][];
};

export type QuestionRejectedEvent = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
};

// ─── Permissions ─────────────────────────────────────────────────────────────

export type PermissionRequestedEvent = {
  permissionResponse: PermissionResponse;
};

export type PermissionResolvedEvent = {
  permissionResponseId: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
};

// ─── Event Map ───────────────────────────────────────────────────────────────

export type InternalEventMap = {
  // Stream lifecycle
  'stream.started': StreamStartedEvent;
  'stream.step.completed': StreamStepCompletedEvent;
  'stream.completed': StreamCompletedEvent;
  'stream.failed': StreamFailedEvent;
  'stream.aborted': StreamAbortedEvent;

  // Part streaming
  'part.update': PartUpdateEvent;
  'part.delta': PartDeltaEvent;

  // Tool lifecycle
  'tool.pending': ToolPendingEvent;
  'tool.started': ToolStartedEvent;
  'tool.completed': ToolCompletedEvent;
  'tool.failed': ToolFailedEvent;
  'tool.progress': ToolProgressEvent;

  // Session lifecycle
  'session.message.saved': SessionMessageSavedEvent;
  'session.title.updated': SessionTitleUpdatedEvent;
  'session.todos.updated': SessionTodosUpdatedEvent;
  'session.compaction.started': SessionCompactionStartedEvent;
  'session.compaction.completed': SessionCompactionCompletedEvent;

  // Error / Recovery
  'stream.retry': StreamRetryEvent;
  'stream.doom_loop.detected': StreamDoomLoopDetectedEvent;
  'stream.permission.rejected': StreamPermissionRejectedEvent;

  // Usage (emitted by runner for adapter consumption)
  'usage.step.failed': UsageStepFailedEvent;
  'usage.doom_loop.failed': UsageDoomLoopFailedEvent;
  'usage.doom_loop.summary': UsageDoomLoopSummaryEvent;

  // Questions
  'question.asked': QuestionAskedEvent;
  'question.replied': QuestionRepliedEvent;
  'question.rejected': QuestionRejectedEvent;

  // Permissions
  'permission.requested': PermissionRequestedEvent;
  'permission.resolved': PermissionResolvedEvent;
};
