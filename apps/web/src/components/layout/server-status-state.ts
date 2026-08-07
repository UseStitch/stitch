import type { SseConnectionStatus } from '@stitch/shared/realtime';

import { formatTimeAgo } from '@/lib/format';

/** `pending` covers "not yet known" and "recovering"; neither is a confirmed outage. */
export type StatusState = 'ok' | 'pending' | 'down';

export const STATE_COLOR = { ok: 'success', pending: 'warning', down: 'destructive' } as const;

export function toServerState(isHealthy: boolean | undefined): StatusState {
  if (isHealthy === undefined) return 'pending';
  return isHealthy ? 'ok' : 'down';
}

export function toEventBusState(status: SseConnectionStatus): StatusState {
  return status === 'connected' ? 'ok' : 'pending';
}

export function worstState(...states: StatusState[]): StatusState {
  if (states.includes('down')) return 'down';
  return states.includes('pending') ? 'pending' : 'ok';
}

export function formatEventBusSubtitle(lastHeartbeat: Date | null): string {
  if (!lastHeartbeat) return 'Connecting';

  const age = formatTimeAgo(lastHeartbeat);
  return `Reconnecting; last heartbeat ${age}`;
}
