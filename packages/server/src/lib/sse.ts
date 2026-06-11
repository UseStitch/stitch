import { SSE_EVENT_NAMES } from '@stitch/shared/realtime';
import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/realtime';

import * as Events from '@/lib/events.js';
import type { SSEStreamingApi } from 'hono/streaming';

const connections = new Set<SSEStreamingApi>();

export function registerConnection(stream: SSEStreamingApi): void {
  connections.add(stream);
}

export function unregisterConnection(stream: SSEStreamingApi): void {
  connections.delete(stream);
}

function broadcast<K extends SseEventName>(event: K, data: SseEventPayloadMap[K]): void {
  const payload = JSON.stringify(data);
  void Promise.allSettled(
    Array.from(connections).map((stream) => stream.writeSSE({ event, data: payload })),
  );
}

/** Subscribe to all events emitted via the event bus and forward them to SSE connections. */
export function initSseBridge(): void {
  for (const eventName of SSE_EVENT_NAMES) {
    Events.on(eventName, (data) => {
      broadcast(eventName, data);
    });
  }
}
