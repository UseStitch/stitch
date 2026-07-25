import { SSE_EVENT_NAMES, type SseConnectionStatus, type SseEventName } from '@stitch/shared/realtime';

/** Slightly over two server heartbeat intervals (15s) to tolerate one dropped beat. */
const IDLE_TIMEOUT_MS = 40_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

/** Exponential backoff with half jitter, capped. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return Math.round(capped / 2 + random() * (capped / 2));
}

export function isIdle(lastMessageAt: number, now: number): boolean {
  return now - lastMessageAt >= IDLE_TIMEOUT_MS;
}

type Options = {
  getUrl: () => Promise<string>;
  onEvent: (name: SseEventName, raw: string) => void;
  onStatus: (status: SseConnectionStatus) => void;
};

export type SseConnection = {
  /** Re-check liveness immediately instead of waiting for the next watchdog tick. */
  poke: () => void;
  /** Force a fresh connection, resetting backoff. */
  reconnect: () => void;
  close: () => void;
};

/**
 * Owns the EventSource lifecycle.
 *
 * EventSource only auto-retries transient failures — it gives up permanently
 * once `readyState` is CLOSED, and it never notices a half-open socket where
 * the peer vanished without a TCP FIN. Both cases leave the app silently
 * disconnected, so reconnection is driven explicitly here.
 */
export function createSseConnection({ getUrl, onEvent, onStatus }: Options): SseConnection {
  let source: EventSource | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMessageAt = Date.now();
  let generation = 0;
  let closed = false;

  const dropSource = () => {
    source?.close();
    source = null;
  };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;
    generation += 1;
    dropSource();
    onStatus('reconnecting');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      tryOpen();
    }, retryDelay(attempt++));
  };

  const open = async (currentGeneration: number) => {
    const baseUrl = await getUrl();
    if (closed || currentGeneration !== generation) return;

    const es = new EventSource(`${baseUrl}/events`);
    source = es;

    es.onopen = () => {
      if (source !== es) return;
      attempt = 0;
      lastMessageAt = Date.now();
      onStatus('connected');
    };

    es.onerror = () => {
      // A stale source can still fire after it has been replaced; ignore it so
      // it cannot mark a healthy connection as broken.
      if (source !== es) return;

      onStatus('reconnecting');
      if (es.readyState !== EventSource.CLOSED) return;
      scheduleRetry();
    };

    for (const name of SSE_EVENT_NAMES) {
      es.addEventListener(name, (event) => {
        if (source !== es) return;
        lastMessageAt = Date.now();
        onEvent(name, (event as MessageEvent<string>).data);
      });
    }
  };

  // A failed URL lookup must not leave the connection permanently dead.
  const tryOpen = () => {
    if (closed) return;
    dropSource();
    const currentGeneration = ++generation;
    // Give the connect attempt itself a fresh idle window.
    lastMessageAt = Date.now();
    void open(currentGeneration).catch(() => {
      if (currentGeneration === generation) scheduleRetry();
    });
  };

  const poke = () => {
    if (closed || retryTimer || !isIdle(lastMessageAt, Date.now())) return;
    scheduleRetry();
  };

  const watchdog = setInterval(poke, WATCHDOG_INTERVAL_MS);

  tryOpen();

  return {
    poke,
    reconnect: () => {
      if (closed) return;
      attempt = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      onStatus('connecting');
      tryOpen();
    },
    close: () => {
      closed = true;
      generation += 1;
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      dropSource();
    },
  };
}
