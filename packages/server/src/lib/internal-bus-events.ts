import type { StreamErrorDetails } from '@stitch/shared/chat/errors';
import type { StoredPart } from '@stitch/shared/chat/messages';
import type { SessionEvents } from '@stitch/shared/chat/session-events';
import type { StreamEvents } from '@stitch/shared/chat/stream-events';
import type { ConnectorEvents } from '@stitch/shared/connectors/events';
import type { PrefixedString } from '@stitch/shared/id';
import type { MailEvents } from '@stitch/shared/mail/events';
import type { McpAuthStatus } from '@stitch/shared/mcp/types';
import type { PermissionEvents } from '@stitch/shared/permissions/events';
import type { QuestionEvents } from '@stitch/shared/questions/events';
import type { RecordingEvents } from '@stitch/shared/recordings/events';
import type { SettingsKey } from '@stitch/shared/settings/types';
import type { SkillEvents } from '@stitch/shared/skills/events';

import type { LanguageModelUsage } from 'ai';

// ─── Stream Lifecycle ────────────────────────────────────────────────────────
// These internal events carry extra metadata not exposed to clients.

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

// ─── Title Generation ────────────────────────────────────────────────────────

type BaseTitleGenerationRequest = { content: string; fallbackProviderId: string; fallbackModelId: string };

export type ChatTitleGenerationRequestedEvent = BaseTitleGenerationRequest & { sessionId: PrefixedString<'ses'> };

export type RecordingAnalysisTitleGenerationRequestedEvent = BaseTitleGenerationRequest & {
  recordingId: PrefixedString<'rec'>;
  analysisId: PrefixedString<'recan'>;
};

// ─── Error / Recovery ────────────────────────────────────────────────────────

export type StreamPermissionRejectedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolName: string;
};

// ─── Usage (emitted by runner for adapter consumption) ───────────────────────

export type UsageMemoryCompletedEvent = {
  providerId: string;
  modelId: string;
  usage: LanguageModelUsage;
  phase: 'extraction' | 'deduplication' | 'consolidation';
  startedAt: number;
  endedAt: number;
};

export type UsageCompactionFailedEvent = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  providerId: string;
  modelId: string;
  errorCode: string | undefined;
  auto: boolean;
  overflow: boolean;
};

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

// ─── MCP ─────────────────────────────────────────────────────────────────────
// Internal uses PrefixedString<'mcp'> for serverId (narrower than shared string).

export type McpToolsChangedEvent = { serverId: PrefixedString<'mcp'>; serverName: string; toolCount: number | null };

export type McpAuthStatusChangedEvent = { serverId: PrefixedString<'mcp'>; authStatus: McpAuthStatus };

// ─── Settings ────────────────────────────────────────────────────────────────

export type SettingsChangedEvent = { key: SettingsKey };

// ─── Automations / Schedules ─────────────────────────────────────────────────

export type AutomationRunStartedEvent = { automationId: PrefixedString<'auto'>; sessionId: PrefixedString<'ses'> };

export type AutomationRunCompletedEvent = { automationId: PrefixedString<'auto'>; sessionId: PrefixedString<'ses'> };

export type AutomationRunFailedEvent = { automationId: PrefixedString<'auto'>; error: string };

export type ScheduleJobFiredEvent = { key: string; automationId: PrefixedString<'auto'> };

export type ScheduleJobSucceededEvent = { key: string; automationId: PrefixedString<'auto'> };

export type ScheduleJobFailedEvent = { key: string; automationId: PrefixedString<'auto'>; error: string };

// ─── Event Map ───────────────────────────────────────────────────────────────

export type InternalEventMap = {
  // Stream lifecycle
  'stream.started': StreamStartedEvent;
  'stream.step.completed': StreamStepCompletedEvent;
  'stream.completed': StreamCompletedEvent;
  'stream.failed': StreamFailedEvent;
  'stream.aborted': StreamAbortedEvent;

  // Part streaming
  'part.update': StreamEvents['stream-part-update'];
  'part.delta': StreamEvents['stream-part-delta'];

  // Tool lifecycle
  'tool.pending': ToolPendingEvent;
  'tool.started': ToolStartedEvent;
  'tool.completed': ToolCompletedEvent;
  'tool.failed': ToolFailedEvent;
  'tool.progress': ToolProgressEvent;

  // Session lifecycle
  'session.message.saved': SessionMessageSavedEvent;
  'session.title.updated': SessionEvents['session-title-update'];
  'session.todos.updated': SessionEvents['session-todos-updated'];
  'session.compaction.started': SessionEvents['compaction-start'];
  'session.compaction.completed': SessionEvents['compaction-complete'];

  // Title generation
  'title.generation.chat.requested': ChatTitleGenerationRequestedEvent;
  'title.generation.recording_analysis.requested': RecordingAnalysisTitleGenerationRequestedEvent;

  // Error / Recovery
  'stream.retry': StreamEvents['stream-retry'];
  'stream.doom_loop.detected': StreamEvents['doom-loop-detected'];
  'stream.permission.rejected': StreamPermissionRejectedEvent;

  // Usage (emitted by runner for adapter consumption)
  'usage.memory.completed': UsageMemoryCompletedEvent;
  'usage.compaction.failed': UsageCompactionFailedEvent;
  'usage.step.failed': UsageStepFailedEvent;
  'usage.doom_loop.failed': UsageDoomLoopFailedEvent;
  'usage.doom_loop.summary': UsageDoomLoopSummaryEvent;

  // Questions
  'question.asked': QuestionEvents['question-asked'];
  'question.replied': QuestionEvents['question-replied'];
  'question.rejected': QuestionEvents['question-rejected'];

  // Permissions
  'permission.requested': PermissionEvents['permission-response-requested'];
  'permission.resolved': PermissionEvents['permission-response-resolved'];

  // Recordings
  'recording.started': RecordingEvents['recording-started'];
  'recording.stopped': RecordingEvents['recording-stopped'];
  'recording.unrecoverable': RecordingEvents['recording-unrecoverable'];
  'recording.analysis.updated': RecordingEvents['recording-analysis-updated'];
  'recording.analysis.completed': RecordingEvents['recording-analysis-completed'];
  'recording.analysis.failed': RecordingEvents['recording-analysis-failed'];
  'recording.transcript.entry': RecordingEvents['recording-transcript-entry'];

  // MCP
  'mcp.tools.list_changed': McpToolsChangedEvent;
  'mcp.tools.changed': McpToolsChangedEvent;
  'mcp.auth.status_changed': McpAuthStatusChangedEvent;

  // Skills
  'skill.created': SkillEvents['skill-created'];
  'skill.updated': SkillEvents['skill-updated'];
  'skill.deleted': SkillEvents['skill-deleted'];

  // Connectors
  'connector.token.refreshed': ConnectorEvents['connector-token-refreshed'];
  'connector.auth.failed': ConnectorEvents['connector-auth-failed'];
  'connector.authorized': ConnectorEvents['connector-authorized'];
  'connector.removed': ConnectorEvents['connector-removed'];

  // Settings
  'settings.changed': SettingsChangedEvent;

  // Automations / Schedules
  'automation.run.started': AutomationRunStartedEvent;
  'automation.run.completed': AutomationRunCompletedEvent;
  'automation.run.failed': AutomationRunFailedEvent;
  'schedule.job.fired': ScheduleJobFiredEvent;
  'schedule.job.succeeded': ScheduleJobSucceededEvent;
  'schedule.job.failed': ScheduleJobFailedEvent;

  // Mail
  'mail.sync.progress': MailEvents['mail.sync.progress'];
  'mail.account.updated': MailEvents['mail.account.updated'];
  'mail.threads.changed': MailEvents['mail.threads.changed'];
};
