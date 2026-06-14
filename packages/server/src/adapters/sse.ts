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
}
