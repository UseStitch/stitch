import type { SSEStreamingApi } from 'hono/streaming';
import type { SseEventName } from '@openwork/shared';

const connections = new Set<SSEStreamingApi>();

export function registerConnection(stream: SSEStreamingApi): void {
  connections.add(stream);
}

export function unregisterConnection(stream: SSEStreamingApi): void {
  connections.delete(stream);
}

export function getConnectionCount(): number {
  return connections.size;
}

export async function broadcast(event: SseEventName, data: unknown): Promise<void> {
  const payload = JSON.stringify(data);
  await Promise.allSettled(
    Array.from(connections).map((stream) => stream.writeSSE({ event, data: payload })),
  );
}
