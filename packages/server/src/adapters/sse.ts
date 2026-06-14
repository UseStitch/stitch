import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/realtime';

import { internalBus } from '@/lib/internal-bus.js';
import type { SSEStreamingApi } from 'hono/streaming';

const connections = new Set<SSEStreamingApi>();

export function registerSseConnection(stream: SSEStreamingApi): void {
  connections.add(stream);
}

export function unregisterSseConnection(stream: SSEStreamingApi): void {
  connections.delete(stream);
}

function broadcast<K extends SseEventName>(event: K, data: SseEventPayloadMap[K]): void {
  const payload = JSON.stringify(data);
  void Promise.allSettled(
    Array.from(connections).map((stream) => stream.writeSSE({ event, data: payload })),
  );
}

/**
 * Registers SSE adapter subscriptions on the internal bus.
 * Maps internal lifecycle events to lean client-facing SSE payloads.
 */
export function registerSseAdapter(): void {
  // ─── Stream Lifecycle ────────────────────────────────────────────────────

  internalBus.onSync('stream.started', (event) => {
    broadcast('stream-start', {
      sessionId: event.sessionId,
      messageId: event.messageId,
    });
  });

  internalBus.onSync('stream.failed', (event) => {
    broadcast('stream-error', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      error: event.error,
      details: event.details,
    });
  });

  internalBus.onSync('stream.retry', (event) => {
    broadcast('stream-retry', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      attempt: event.attempt,
      maxRetries: event.maxRetries,
      delayMs: event.delayMs,
      message: event.message,
    });
  });

  internalBus.onSync('stream.doom_loop.detected', (event) => {
    broadcast('doom-loop-detected', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolName: event.toolName,
      consecutiveCount: event.consecutiveCount,
    });
  });

  // ─── Part Streaming ──────────────────────────────────────────────────────

  internalBus.onSync('part.update', (event) => {
    broadcast('stream-part-update', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      partId: event.partId,
      part: event.part,
    });
  });

  internalBus.onSync('part.delta', (event) => {
    broadcast('stream-part-delta', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      partId: event.partId,
      delta: event.delta,
    });
  });

  // ─── Tool Lifecycle ──────────────────────────────────────────────────────

  internalBus.onSync('tool.pending', (event) => {
    broadcast('stream-tool-state', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'pending',
    });
  });

  internalBus.onSync('tool.started', (event) => {
    broadcast('stream-tool-state', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'in-progress',
      input: event.input,
    });
  });

  internalBus.onSync('tool.completed', (event) => {
    broadcast('stream-tool-state', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'completed',
      input: event.input,
      output: event.output,
    });
  });

  internalBus.onSync('tool.failed', (event) => {
    broadcast('stream-tool-state', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'error',
      error: event.error,
    });
  });

  internalBus.onSync('tool.progress', (event) => {
    broadcast('stream-tool-state', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'in-progress',
      output: event.output,
    });
  });

  // ─── Session Lifecycle ───────────────────────────────────────────────────

  internalBus.onSync('session.message.saved', (event) => {
    broadcast('stream-finish', {
      sessionId: event.sessionId,
      messageId: event.messageId,
      finishReason: event.finishReason,
      usage: event.usage,
    });
  });

  internalBus.onSync('session.title.updated', (event) => {
    broadcast('session-title-update', {
      sessionId: event.sessionId,
      title: event.title,
    });
  });

  internalBus.onSync('session.todos.updated', (event) => {
    broadcast('session-todos-updated', {
      sessionId: event.sessionId,
    });
  });

  internalBus.onSync('session.compaction.started', (event) => {
    broadcast('compaction-start', {
      sessionId: event.sessionId,
      messageId: event.messageId,
    });
  });

  internalBus.onSync('session.compaction.completed', (event) => {
    broadcast('compaction-complete', {
      sessionId: event.sessionId,
      summaryMessageId: event.summaryMessageId,
    });
  });

  // ─── Questions ────────────────────────────────────────────────────────────

  internalBus.onSync('question.asked', (event) => {
    broadcast('question-asked', { question: event.question });
  });

  internalBus.onSync('question.replied', (event) => {
    broadcast('question-replied', {
      questionId: event.questionId,
      sessionId: event.sessionId,
      answers: event.answers,
    });
  });

  internalBus.onSync('question.rejected', (event) => {
    broadcast('question-rejected', {
      questionId: event.questionId,
      sessionId: event.sessionId,
    });
  });

  // ─── Permissions ──────────────────────────────────────────────────────────

  internalBus.onSync('permission.requested', (event) => {
    broadcast('permission-response-requested', {
      permissionResponse: event.permissionResponse,
    });
  });

  internalBus.onSync('permission.resolved', (event) => {
    broadcast('permission-response-resolved', {
      permissionResponseId: event.permissionResponseId,
      sessionId: event.sessionId,
    });
  });

  // ─── Recordings ─────────────────────────────────────────────────────────────

  internalBus.onSync('recording.started', (event) => {
    broadcast('recording-started', { recordingId: event.recordingId });
  });

  internalBus.onSync('recording.stopped', (event) => {
    broadcast('recording-stopped', { recordingId: event.recordingId });
  });

  internalBus.onSync('recording.analysis.updated', (event) => {
    broadcast('recording-analysis-updated', {
      recordingId: event.recordingId,
      status: event.status,
      title: event.title,
    });
  });

  internalBus.onSync('recording.transcript.entry', (event) => {
    broadcast('recording-transcript-entry', {
      recordingId: event.recordingId,
      kind: event.kind,
      source: event.source,
      speaker: event.speaker,
      content: event.content,
      offsetMs: event.offsetMs,
    });
  });
}
