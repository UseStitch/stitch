import type { SseEventName, SseEventPayloadMap } from '@openwork/shared';

import type { SSEStreamingApi } from 'hono/streaming';

const connections = new Set<SSEStreamingApi>();

export function registerConnection(stream: SSEStreamingApi): void {
  connections.add(stream);
}

export function unregisterConnection(stream: SSEStreamingApi): void {
  connections.delete(stream);
}

export async function broadcast<K extends SseEventName>(
  event: K,
  data: SseEventPayloadMap[K],
): Promise<void> {
  const payload = JSON.stringify(data);
  await Promise.allSettled(
    Array.from(connections).map((stream) => stream.writeSSE({ event, data: payload })),
  );
}
