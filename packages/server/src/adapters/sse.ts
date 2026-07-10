import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/realtime';

import type { InternalEventMap } from '@/lib/internal-bus-events.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { SSEStreamingApi } from 'hono/streaming';

type InternalEventName = keyof InternalEventMap;

const connections = new Set<SSEStreamingApi>();

export function registerSseConnection(stream: SSEStreamingApi): void {
  connections.add(stream);
}

export function unregisterSseConnection(stream: SSEStreamingApi): void {
  connections.delete(stream);
}

function broadcast<K extends SseEventName>(event: K, data: SseEventPayloadMap[K]): void {
  const payload = JSON.stringify(data);
  void Promise.allSettled(Array.from(connections).map((stream) => stream.writeSSE({ event, data: payload })));
}

/**
 * Typed forwarding helper. Subscribes to an internal bus event and broadcasts
 * a projected payload to all SSE clients. The projection function narrows
 * the richer internal event into the lean client-facing SSE payload.
 */
function forward<I extends InternalEventName, S extends SseEventName>(
  internalName: I,
  sseName: S,
  project: (event: InternalEventMap[I]) => SseEventPayloadMap[S],
): void {
  internalBus.onSync(internalName, (event) => {
    broadcast(sseName, project(event));
  });
}

/**
 * Shorthand for events where the internal payload is identical to the SSE payload.
 * The internal event is forwarded as-is with no transformation.
 */
function passthrough<I extends InternalEventName, S extends SseEventName>(
  internalName: I,
  sseName: S & SseEventPayloadMap[S] extends InternalEventMap[I] ? S : never,
): void {
  internalBus.onSync(internalName, (event) => {
    broadcast(sseName, event as unknown as SseEventPayloadMap[S]);
  });
}

/**
 * Registers SSE adapter subscriptions on the internal bus.
 * Maps internal lifecycle events to lean client-facing SSE payloads.
 */
export function registerSseAdapter(): void {
  // ─── Stream Lifecycle ────────────────────────────────────────────────────

  forward('stream.started', 'stream-start', ({ sessionId, messageId }) => ({ sessionId, messageId }));

  forward('stream.failed', 'stream-error', ({ sessionId, messageId, error, details }) => ({
    sessionId,
    messageId,
    error,
    details,
  }));

  forward('stream.retry', 'stream-retry', ({ sessionId, messageId, attempt, maxRetries, delayMs, message }) => ({
    sessionId,
    messageId,
    attempt,
    maxRetries,
    delayMs,
    message,
  }));

  forward(
    'stream.doom_loop.detected',
    'doom-loop-detected',
    ({ sessionId, messageId, toolName, consecutiveCount }) => ({ sessionId, messageId, toolName, consecutiveCount }),
  );

  // ─── Part Streaming ──────────────────────────────────────────────────────

  passthrough('part.update', 'stream-part-update');

  passthrough('part.delta', 'stream-part-delta');

  // ─── Tool Lifecycle ──────────────────────────────────────────────────────
  // Five internal events collapse into one discriminated SSE event.

  forward('tool.pending', 'stream-tool-state', ({ sessionId, messageId, toolCallId, toolName }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'pending',
  }));

  forward('tool.started', 'stream-tool-state', ({ sessionId, messageId, toolCallId, toolName, input }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'in-progress',
    input,
  }));

  forward('tool.completed', 'stream-tool-state', ({ sessionId, messageId, toolCallId, toolName, input, output }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'completed',
    input,
    output,
  }));

  forward('tool.failed', 'stream-tool-state', ({ sessionId, messageId, toolCallId, toolName, error }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'error',
    error,
  }));

  forward('tool.progress', 'stream-tool-state', ({ sessionId, messageId, toolCallId, toolName, output }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'in-progress',
    output,
  }));

  // ─── Session Lifecycle ───────────────────────────────────────────────────

  forward('session.message.saved', 'stream-finish', ({ sessionId, messageId, finishReason, usage }) => ({
    sessionId,
    messageId,
    finishReason,
    usage,
  }));

  passthrough('session.title.updated', 'session-title-update');

  passthrough('session.todos.updated', 'session-todos-updated');

  forward('session.compaction.started', 'compaction-start', ({ sessionId, messageId }) => ({ sessionId, messageId }));

  forward('session.compaction.completed', 'compaction-complete', ({ sessionId, summaryMessageId }) => ({
    sessionId,
    summaryMessageId,
  }));

  // ─── Questions ────────────────────────────────────────────────────────────

  passthrough('question.asked', 'question-asked');

  passthrough('question.replied', 'question-replied');

  passthrough('question.rejected', 'question-rejected');

  // ─── Permissions ──────────────────────────────────────────────────────────

  passthrough('permission.requested', 'permission-response-requested');

  passthrough('permission.resolved', 'permission-response-resolved');

  // ─── MCP ───────────────────────────────────────────────────────────────────

  forward('mcp.tools.changed', 'mcp-tools-changed', ({ serverId, serverName, toolCount }) => ({
    serverId,
    serverName,
    toolCount,
  }));

  forward('mcp.auth.status_changed', 'mcp-auth-status-changed', ({ serverId, authStatus }) => ({
    serverId,
    authStatus,
  }));

  // ─── Recordings ─────────────────────────────────────────────────────────────

  passthrough('recording.started', 'recording-started');

  passthrough('recording.stopped', 'recording-stopped');

  passthrough('recording.unrecoverable', 'recording-unrecoverable');

  passthrough('recording.analysis.updated', 'recording-analysis-updated');

  passthrough('recording.analysis.completed', 'recording-analysis-completed');

  passthrough('recording.analysis.failed', 'recording-analysis-failed');

  passthrough('recording.transcript.entry', 'recording-transcript-entry');

  // ─── Skills ────────────────────────────────────────────────────────────────

  passthrough('skill.created', 'skill-created');

  passthrough('skill.updated', 'skill-updated');

  passthrough('skill.deleted', 'skill-deleted');

  // ─── Connectors ────────────────────────────────────────────────────────────

  passthrough('connector.token.refreshed', 'connector-token-refreshed');

  passthrough('connector.auth.failed', 'connector-auth-failed');

  passthrough('connector.authorized', 'connector-authorized');

  passthrough('connector.removed', 'connector-removed');

  // ─── Mail ───────────────────────────────────────────────────────────────────

  passthrough('mail.sync.progress', 'mail.sync.progress');

  passthrough('mail.account.updated', 'mail.account.updated');

  passthrough('mail.threads.changed', 'mail.threads.changed');
}
