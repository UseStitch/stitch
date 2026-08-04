import { DEFAULT_POSTHOG_HOST } from '@stitch/shared/telemetry/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'telemetry:service' });

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_QUEUE_SIZE = 200;

type QueuedEvent = { event: string; distinct_id: string; properties: Record<string, unknown>; timestamp: string };

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let posthogKey: string | null = null;
let posthogHost: string = DEFAULT_POSTHOG_HOST;
let enabled = true;

function isConfigured(): boolean {
  return enabled && posthogKey !== null && posthogKey.length > 0;
}

/**
 * Initialize the server telemetry service.
 * No-op if key is missing or telemetry is disabled.
 */
export function initServerTelemetry(): void {
  const key = process.env['STITCH_POSTHOG_KEY']?.trim() ?? '';
  const host = process.env['STITCH_POSTHOG_HOST']?.trim() ?? '';
  const disabledEnv = process.env['STITCH_TELEMETRY_ENABLED']?.trim();

  if (disabledEnv === 'false') {
    enabled = false;
    log.info('server telemetry disabled via STITCH_TELEMETRY_ENABLED=false');
    return;
  }

  if (!key) {
    enabled = false;
    log.info('server telemetry disabled: no STITCH_POSTHOG_KEY configured');
    return;
  }

  posthogKey = key;
  if (host) posthogHost = host;
  enabled = true;

  flushTimer = setInterval(() => {
    void flushQueue();
  }, FLUSH_INTERVAL_MS);

  // Unref so the timer doesn't keep the process alive during shutdown
  if (flushTimer && typeof flushTimer.unref === 'function') {
    flushTimer.unref();
  }

  log.info({ host: posthogHost }, 'server telemetry initialized');
}

/**
 * Flush queued events to PostHog. Best-effort — never throws.
 */
async function flushQueue(): Promise<void> {
  if (!isConfigured() || queue.length === 0) return;

  const batch = queue.splice(0, BATCH_SIZE);

  try {
    const response = await fetch(`${posthogHost}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: posthogKey, batch: batch.map((e) => ({ ...e, type: 'capture' })) }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      log.warn({ status: response.status }, 'telemetry batch delivery failed');
      if (queue.length + batch.length <= MAX_QUEUE_SIZE) {
        queue.unshift(...batch);
      }
    }
  } catch (error) {
    log.warn({ error }, 'telemetry batch delivery error');
    if (queue.length + batch.length <= MAX_QUEUE_SIZE) {
      queue.unshift(...batch);
    }
  }
}

/**
 * Graceful shutdown: flush remaining events and stop timer.
 */
export async function shutdownServerTelemetry(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (!isConfigured() || queue.length === 0) return;

  while (queue.length > 0) {
    await flushQueue();
  }

  log.info('server telemetry flushed and shut down');
}

/**
 * Check if server telemetry is enabled (for middleware decisions).
 */
export function isServerTelemetryEnabled(): boolean {
  return enabled && posthogKey !== null && posthogKey.length > 0;
}
