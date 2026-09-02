import type { PrefixedString } from '@stitch/shared/id';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'abort-registry' });

type SessionRun = (abortSignal: AbortSignal) => Promise<void>;

type QueuedRun = { run: SessionRun; resolve: () => void; reject: (error: unknown) => void };

type SessionQueue = { runs: QueuedRun[]; activeController: AbortController | null };

const queues = new Map<PrefixedString<'ses'>, SessionQueue>();

async function runNext(sessionId: PrefixedString<'ses'>, queue: SessionQueue): Promise<void> {
  const queued = queue.runs.shift();
  if (!queued) {
    if (queues.get(sessionId) === queue) queues.delete(sessionId);
    return;
  }

  const controller = new AbortController();
  queue.activeController = controller;

  try {
    await queued.run(controller.signal);
    queued.resolve();
  } catch (error) {
    queued.reject(error);
  } finally {
    queue.activeController = null;
    void runNext(sessionId, queue);
  }
}

export function enqueueSessionRun(sessionId: PrefixedString<'ses'>, run: SessionRun): Promise<void> {
  let queue = queues.get(sessionId);
  if (!queue) {
    queue = { runs: [], activeController: null };
    queues.set(sessionId, queue);
  }

  const promise = new Promise<void>((resolve, reject) => {
    queue.runs.push({ run, resolve, reject });
  });

  if (!queue.activeController) void runNext(sessionId, queue);
  return promise;
}

export function abortActiveSessionRun(sessionId: PrefixedString<'ses'>): void {
  queues.get(sessionId)?.activeController?.abort();
}

export function cancelQueuedSessionRuns(sessionId: PrefixedString<'ses'>): void {
  const queue = queues.get(sessionId);
  if (!queue) return;

  for (const queued of queue.runs.splice(0)) queued.resolve();
  if (!queue.activeController) queues.delete(sessionId);
}

export function isSessionRunActive(sessionId: PrefixedString<'ses'>): boolean {
  return Boolean(queues.get(sessionId)?.activeController);
}

// ---------------------------------------------------------------------------
// Generic abort registry (collapsed from lib/abort-registry.ts)
// Private per-session AbortControllers for background/child sessions.
// ---------------------------------------------------------------------------

const genericRegistry = new Map<PrefixedString<'ses'>, AbortController>();

export function register(sessionId: PrefixedString<'ses'>): AbortSignal {
  const existing = genericRegistry.get(sessionId);
  if (existing) {
    log.warn(
      { event: 'stream.abort.registry_reregister', sessionId },
      'aborting existing controller before re-registering',
    );
    existing.abort();
  }

  const controller = new AbortController();
  genericRegistry.set(sessionId, controller);
  return controller.signal;
}

export function abort(sessionId: PrefixedString<'ses'>): void {
  const controller = genericRegistry.get(sessionId);
  if (!controller) return;
  log.info({ event: 'stream.abort.registry_abort', sessionId }, 'aborting session');
  controller.abort();
  genericRegistry.delete(sessionId);
}

export function cleanup(sessionId: PrefixedString<'ses'>): void {
  genericRegistry.delete(sessionId);
}

export function abortSession(sessionId: PrefixedString<'ses'>): void {
  abortActiveSessionRun(sessionId);
  cancelQueuedSessionRuns(sessionId);
}
