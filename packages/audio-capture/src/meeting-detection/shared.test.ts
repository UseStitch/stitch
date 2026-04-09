import { afterEach, describe, expect, test, vi } from 'vitest';

import { createPollingMeetingDetector } from './shared.js';
import type { MeetingDetectionEvent } from '../types.js';

function waitForAsyncTick(): Promise<void> {
  return Promise.resolve();
}

describe('createPollingMeetingDetector', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('emits detected only after activation threshold', async () => {
    vi.useFakeTimers();
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

    await vi.advanceTimersByTimeAsync(250);
    await waitForAsyncTick();
    expect(events).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(150);
    await waitForAsyncTick();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'detected' });

    active = false;
    await vi.advanceTimersByTimeAsync(200);
    await waitForAsyncTick();

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'ended', key: 'desktop:zoom' });

    detector.stop();
  });

  test('does not re-emit detected while in cooldown', async () => {
    vi.useFakeTimers();
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

    active = true;
    await vi.advanceTimersByTimeAsync(300);
    await waitForAsyncTick();

    active = false;
    await vi.advanceTimersByTimeAsync(200);
    await waitForAsyncTick();

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'ended')).toHaveLength(1);

    active = true;
    await vi.advanceTimersByTimeAsync(600);
    await waitForAsyncTick();

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(300);
    await waitForAsyncTick();

    expect(events.filter((event) => event.type === 'detected')).toHaveLength(2);

    detector.stop();
  });
});
