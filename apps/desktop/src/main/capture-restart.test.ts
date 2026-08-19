import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { createCaptureRestarter } from './capture-restart.js';

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

async function advanceTime(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await flushAsyncWork();
}

const FAST = { debounceMs: 10, backoffMs: 5 };

describe('createCaptureRestarter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('debounces bursts of triggers into a single restart', async () => {
    let restarts = 0;
    const restarter = createCaptureRestarter({
      ...FAST,
      restart: async () => {
        restarts += 1;
      },
      onGiveUp: () => {},
    });

    restarter.trigger();
    restarter.trigger();
    restarter.trigger();
    await advanceTime(FAST.debounceMs - 1);
    expect(restarts).toBe(0);

    await advanceTime(1);
    expect(restarts).toBe(1);
  });

  test('retries with backoff and gives up after maxAttempts', async () => {
    let restarts = 0;
    const errors: string[] = [];
    const restarter = createCaptureRestarter({
      ...FAST,
      maxAttempts: 3,
      restart: async () => {
        restarts += 1;
        throw new Error('device busy');
      },
      onGiveUp: (message) => {
        errors.push(message);
      },
    });

    restarter.trigger();
    await advanceTime(FAST.debounceMs);
    await advanceTime(FAST.backoffMs);
    await advanceTime(FAST.backoffMs * 2);

    expect(restarts).toBe(3);
    expect(errors).toEqual(['device busy']);
  });

  test('a successful restart resets the attempt budget', async () => {
    let calls = 0;
    let gaveUp = false;
    const restarter = createCaptureRestarter({
      ...FAST,
      maxAttempts: 2,
      restart: async () => {
        calls += 1;
        if (calls % 2 === 1) {
          throw new Error('transient');
        }
      },
      onGiveUp: () => {
        gaveUp = true;
      },
    });

    restarter.trigger();
    await advanceTime(FAST.debounceMs);
    await advanceTime(FAST.backoffMs);
    expect(calls).toBe(2);

    restarter.trigger();
    await advanceTime(FAST.debounceMs);
    await advanceTime(FAST.backoffMs);

    expect(calls).toBe(4);
    expect(gaveUp).toBe(false);
  });

  test('cancel clears scheduled restarts and ignores future triggers', async () => {
    let restarts = 0;
    const restarter = createCaptureRestarter({
      ...FAST,
      restart: async () => {
        restarts += 1;
      },
      onGiveUp: () => {},
    });

    restarter.trigger();
    restarter.cancel();
    restarter.trigger();
    await advanceTime(FAST.debounceMs);

    expect(restarts).toBe(0);
  });

  test('a trigger during an in-flight restart schedules a follow-up restart', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const firstRestartGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const restarter = createCaptureRestarter({
      ...FAST,
      restart: async () => {
        calls += 1;
        if (calls === 1) {
          await firstRestartGate;
        }
      },
      onGiveUp: () => {},
    });

    restarter.trigger();
    await advanceTime(FAST.debounceMs);
    expect(calls).toBe(1);

    restarter.trigger();
    release();
    await flushAsyncWork();
    await advanceTime(FAST.debounceMs);

    expect(calls).toBe(2);
  });
});
