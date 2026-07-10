import { SSE_EVENT_NAMES, type SseEventName, type SseEventPayloadMap } from '@stitch/shared/realtime';

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
 * SSE events that are NOT passthroughs — they either don't exist on the
 * internal bus, or require payload transformation before broadcasting.
 * Everything else in SSE_EVENT_NAMES is forwarded as-is from the internal bus.
 */
const NON_PASSTHROUGH = new Set<SseEventName>([
  'heartbeat',
  'connected',
  'stream.started',
  'stream.error',
  'stream.finish',
  'tool.state',
]);

type PassthroughEventName = InternalEventName & SseEventName;

const PASSTHROUGH_EVENTS = SSE_EVENT_NAMES.filter((name): name is PassthroughEventName => !NON_PASSTHROUGH.has(name));

/**
 * Registers SSE adapter subscriptions on the internal bus.
 * Maps internal lifecycle events to lean client-facing SSE payloads.
 */
export function registerSseAdapter(): void {
  // ─── Passthrough: same name, same payload ───────────────────────────────
  for (const name of PASSTHROUGH_EVENTS) {
    internalBus.onSync(name, (event) => {
      broadcast(name, event as SseEventPayloadMap[typeof name]);
    });
  }

  // ─── Stream Lifecycle (projected) ───────────────────────────────────────

  forward('stream.started', 'stream.started', ({ sessionId, messageId }) => ({ sessionId, messageId }));

  forward('stream.failed', 'stream.error', ({ sessionId, messageId, error, details }) => ({
    sessionId,
    messageId,
    error,
    details,
  }));

  // ─── Tool Lifecycle ──────────────────────────────────────────────────────
  // Five internal events collapse into one discriminated SSE event.

  forward('tool.pending', 'tool.state', ({ sessionId, messageId, toolCallId, toolName }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'pending',
  }));

  forward('tool.started', 'tool.state', ({ sessionId, messageId, toolCallId, toolName, input }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'in-progress',
    input,
  }));

  forward('tool.completed', 'tool.state', ({ sessionId, messageId, toolCallId, toolName, input, output }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'completed',
    input,
    output,
  }));

  forward('tool.failed', 'tool.state', ({ sessionId, messageId, toolCallId, toolName, error }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'error',
    error,
  }));

  forward('tool.progress', 'tool.state', ({ sessionId, messageId, toolCallId, toolName, output }) => ({
    sessionId,
    messageId,
    toolCallId,
    toolName,
    status: 'in-progress',
    output,
  }));

  // ─── Session → Stream Finish ────────────────────────────────────────────

  forward('session.message.saved', 'stream.finish', ({ sessionId, messageId, finishReason, usage }) => ({
    sessionId,
    messageId,
    finishReason,
    usage,
  }));
}
