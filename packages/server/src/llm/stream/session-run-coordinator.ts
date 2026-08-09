import type { PrefixedString } from '@stitch/shared/id';

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
