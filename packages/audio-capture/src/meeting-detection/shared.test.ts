import { afterEach, describe, expect, jest, test } from 'bun:test';

import { createPollingMeetingDetector } from './shared.js';

import type { MeetingDetectionEvent } from '../types.js';

function waitForAsyncTick(): Promise<void> {
  return Promise.resolve();
}

async function advancePollingTime(ms: number): Promise<void> {
  let remainingMs = ms;
  while (remainingMs > 0) {
    const stepMs = Math.min(remainingMs, 100);
    jest.advanceTimersByTime(stepMs);
    await waitForAsyncTick();
    await waitForAsyncTick();
    remainingMs -= stepMs;
  }
}

describe('createPollingMeetingDetector', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('emits detected only after activation threshold', async () => {
    jest.useFakeTimers();
    let active = true;
    const events: MeetingDetectionEvent[] = [];

    const detector = createPollingMeetingDetector(
      async () =>
        active
          ? [
              {
                key: 'desktop:zoom',
                platform: 'zoom',
                kind: 'desktop',
                displayName: 'Zoom',
                processNames: ['zoom'],
                windowTitle: 'Weekly Zoom Meeting',
              },
            ]
          : [],
      {
        pollIntervalMs: 100,
        activationThresholdMs: 300,
        cooldownMs: 1_000,
      },
    );

    detector.subscribe((event) => events.push(event));
    detector.start();
    await waitForAsyncTick();

    await advancePollingTime(250);
    expect(events).toHaveLength(0);

    await advancePollingTime(150);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'detected' });

    active = false;
    await advancePollingTime(300);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'ended', key: 'desktop:zoom' });

    detector.stop();
  });

  test('does not re-emit detected while in cooldown', async () => {
    jest.useFakeTimers();
    let active = false;
    const events: MeetingDetectionEvent[] = [];

    const detector = createPollingMeetingDetector(
      async () =>
        active
          ? [
              {
                key: 'desktop:teams',
                platform: 'teams',
                kind: 'desktop',
                displayName: 'Microsoft Teams',
                processNames: ['ms-teams'],
                windowTitle: 'Teams Meeting',
              },
            ]
          : [],
      {
        pollIntervalMs: 100,
        activationThresholdMs: 200,
        cooldownMs: 800,
      },
    );

    detector.subscribe((event) => events.push(event));
    detector.start();
    await waitForAsyncTick();

    active = true;
    await advancePollingTime(300);

    active = false;
    await advancePollingTime(200);

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'ended')).toHaveLength(1);

    active = true;
    await advancePollingTime(600);

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(1);

    await advancePollingTime(300);

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(2);

    detector.stop();
  });
});
