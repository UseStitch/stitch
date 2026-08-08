import { describe, expect, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

import {
  abortActiveSessionRun,
  cancelQueuedSessionRuns,
  enqueueSessionRun,
  isSessionRunActive,
} from '@/llm/stream/session-run-coordinator.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('session run coordinator', () => {
  test('runs same-session work in FIFO order without overlap', async () => {
    const sessionId = 'ses_fifo' as PrefixedString<'ses'>;
    const firstRelease = deferred();
    const events: string[] = [];

    const first = enqueueSessionRun(sessionId, async () => {
      events.push('first-start');
      await firstRelease.promise;
      events.push('first-end');
    });
    const second = enqueueSessionRun(sessionId, () => {
      events.push('second');
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(events).toEqual(['first-start']);
    firstRelease.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });

  test('runs different sessions concurrently', async () => {
    const firstRelease = deferred();
    const secondRelease = deferred();
    const started: string[] = [];

    const first = enqueueSessionRun('ses_one' as PrefixedString<'ses'>, async () => {
      started.push('one');
      await firstRelease.promise;
    });
    const second = enqueueSessionRun('ses_two' as PrefixedString<'ses'>, async () => {
      started.push('two');
      await secondRelease.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(['one', 'two']);
    firstRelease.resolve();
    secondRelease.resolve();
    await Promise.all([first, second]);
  });

  test('continues after a rejected run', async () => {
    const sessionId = 'ses_rejection' as PrefixedString<'ses'>;
    const events: string[] = [];

    const first = enqueueSessionRun(sessionId, () => Promise.reject(new Error('failed')));
    const second = enqueueSessionRun(sessionId, () => {
      events.push('second');
      return Promise.resolve();
    });

     expect(first).rejects.toThrow('failed');
    await second;
    expect(events).toEqual(['second']);
  });

  test('aborts only the active run and allows queued work to continue', async () => {
    const sessionId = 'ses_abort' as PrefixedString<'ses'>;
    let activeSignal: AbortSignal | undefined;
    let secondRan = false;

    const first = enqueueSessionRun(sessionId, (signal) => {
      activeSignal = signal;
      return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    const second = enqueueSessionRun(sessionId, () => {
      secondRan = true;
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(isSessionRunActive(sessionId)).toBe(true);
    abortActiveSessionRun(sessionId);
    await Promise.all([first, second]);
    expect(activeSignal?.aborted).toBe(true);
    expect(secondRan).toBe(true);
    expect(isSessionRunActive(sessionId)).toBe(false);
  });

  test('cancels queued work without stopping the active run', async () => {
    const sessionId = 'ses_cancel_queue' as PrefixedString<'ses'>;
    const release = deferred();
    let queuedRan = false;

    const active = enqueueSessionRun(sessionId, () => release.promise);
    const queued = enqueueSessionRun(sessionId, () => {
      queuedRan = true;
      return Promise.resolve();
    });

    await Promise.resolve();
    cancelQueuedSessionRuns(sessionId);
    release.resolve();
    await Promise.all([active, queued]);
    expect(queuedRan).toBe(false);
  });
});
