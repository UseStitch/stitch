import { describe, expect, test } from 'bun:test';

import { createCaptureRestarter, isRestartTriggerCode } from './capture-restart.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FAST = { debounceMs: 10, backoffMs: 5 };

describe('isRestartTriggerCode', () => {
  test('matches stream-death codes', () => {
    expect(isRestartTriggerCode('mic_stream_ended')).toBe(true);
    expect(isRestartTriggerCode('speaker_stream_ended')).toBe(true);
    expect(isRestartTriggerCode('aec_resample_failed')).toBe(true);
  });

  test('ignores non-terminal warnings', () => {
    expect(isRestartTriggerCode('speaker_start_failed')).toBe(false);
    expect(isRestartTriggerCode('input_backpressure')).toBe(false);
  });
});

describe('createCaptureRestarter', () => {
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
    await sleep(30);

    expect(restarts).toBe(1);
  });

  test('retries with backoff and gives up after maxAttempts', async () => {
    let restarts = 0;
    const gaveUp: string[] = [];
    const restarter = createCaptureRestarter({
      ...FAST,
      maxAttempts: 3,
      restart: async () => {
        restarts += 1;
        throw new Error('device busy');
      },
      onGiveUp: (message) => {
        gaveUp.push(message);
      },
    });

    restarter.trigger();
    await sleep(100);

    expect(restarts).toBe(3);
    expect(gaveUp).toEqual(['device busy']);
  });

  test('a successful restart resets the attempt budget', async () => {
    let calls = 0;
    let gaveUp = false;
    const restarter = createCaptureRestarter({
      ...FAST,
      maxAttempts: 2,
      restart: async () => {
        calls += 1;
        // Fail every first attempt, succeed on the retry.
        if (calls % 2 === 1) {
          throw new Error('transient');
        }
      },
      onGiveUp: () => {
        gaveUp = true;
      },
    });

    restarter.trigger();
    await sleep(50);
    restarter.trigger();
    await sleep(50);

    expect(calls).toBe(4);
    expect(gaveUp).toBe(false);
  });

  test('cancel prevents a scheduled restart', async () => {
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
    await sleep(30);

    expect(restarts).toBe(0);
  });

  test('ignores triggers after cancel', async () => {
    let restarts = 0;
    const restarter = createCaptureRestarter({
      ...FAST,
      restart: async () => {
        restarts += 1;
      },
      onGiveUp: () => {},
    });

    restarter.cancel();
    restarter.trigger();
    await sleep(30);

    expect(restarts).toBe(0);
  });

  test('a trigger during an in-flight restart schedules a follow-up restart', async () => {
    let restarts = 0;
    let release: () => void = () => {};
    const firstRestartGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const restarter = createCaptureRestarter({
      ...FAST,
      restart: async () => {
        restarts += 1;
        if (restarts === 1) {
          await firstRestartGate;
        }
      },
      onGiveUp: () => {},
    });

    restarter.trigger();
    await sleep(20);
    expect(restarts).toBe(1);

    restarter.trigger();
    release();
    await sleep(30);

    expect(restarts).toBe(2);
  });
});
