import { describe, expect, test } from 'bun:test';

import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionEvent } from '../types.js';

describe('createMeetingDetectionEngine', () => {
  test('emits detected only after activation threshold', () => {
    const now = 1_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 300,
      cooldownMs: 1_000,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Weekly Zoom Meeting',
    };

    engine.ingest([observation], now);
    expect(events).toHaveLength(0);

    engine.ingest([observation], now + 250);
    expect(events).toHaveLength(0);

    engine.ingest([observation], now + 400);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'detected' });

    engine.ingest([], now + 700);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'ended', key: 'desktop:zoom' });
  });

  test('does not re-emit detected while in cooldown', () => {
    const now = 2_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 200,
      cooldownMs: 800,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:teams',
      platform: 'teams' as const,
      kind: 'desktop' as const,
      displayName: 'Microsoft Teams',
      processNames: ['ms-teams'] as string[],
      windowTitle: 'Teams Meeting',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 100);
    engine.ingest([observation], now + 300);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([], now + 500);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1);

    engine.ingest([observation], now + 1100);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([observation], now + 1900);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(2);
  });
});
