import { describe, expect, test } from 'bun:test';

import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionEvent } from '../types.js';

describe('createMeetingDetectionEngine', () => {
  test('emits detected only after activation threshold', () => {
    const now = 1_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({ activationThresholdMs: 300, cooldownMs: 1_000, endGraceMs: 0 });

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
      endGraceMs: 0,
      minRepromptIntervalMs: 0,
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

  test('detects meeting even when snapshot interval is slower than activation threshold', () => {
    const now = 3_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({ activationThresholdMs: 300, cooldownMs: 1_000, endGraceMs: 0 });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 400);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'detected' });
  });

  test('throws when staleCandidateThresholdMs < activationThresholdMs', () => {
    expect(() => createMeetingDetectionEngine({ activationThresholdMs: 500, staleCandidateThresholdMs: 100 })).toThrow(
      'staleCandidateThresholdMs',
    );
  });

  test('does not emit ended for transient signal drops within the end grace period', () => {
    const now = 4_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 200,
      cooldownMs: 1_000,
      endGraceMs: 1_000,
      staleCandidateThresholdMs: 5_000,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 300);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([], now + 600);
    engine.ingest([observation], now + 900);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(0);
    expect(engine.getActive()).not.toBeNull();
  });

  test('emits ended only after the signal is absent for the full end grace period', () => {
    const now = 5_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 200,
      cooldownMs: 1_000,
      endGraceMs: 1_000,
      staleCandidateThresholdMs: 5_000,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 300);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([], now + 600);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(0);

    engine.ingest([], now + 1_700);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1);
  });

  test('does not re-prompt for a dismissed meeting while the call is still active', () => {
    const now = 6_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 200,
      cooldownMs: 1_000,
      endGraceMs: 1_000,
      minRepromptIntervalMs: 0,
      staleCandidateThresholdMs: 5_000,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 300);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.dismiss('desktop:zoom', now + 400);

    engine.ingest([observation], now + 700);
    engine.ingest([observation], now + 1_200);
    engine.ingest([observation], now + 1_800);

    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);
  });

  test('re-detects a dismissed meeting after it truly ends and cooldown elapses', () => {
    const now = 7_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 200,
      cooldownMs: 500,
      endGraceMs: 300,
      minRepromptIntervalMs: 0,
      staleCandidateThresholdMs: 5_000,
    });

    engine.subscribe((event) => events.push(event));

    const observation = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };

    engine.ingest([observation], now);
    engine.ingest([observation], now + 300);
    engine.dismiss('desktop:zoom', now + 350);

    engine.ingest([], now + 400);
    engine.ingest([], now + 800);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1);

    engine.ingest([observation], now + 1_400);
    engine.ingest([observation], now + 1_700);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(2);
  });

  test('enforces a global minimum re-prompt interval across meetings', () => {
    const now = 8_000_000;
    const events: MeetingDetectionEvent[] = [];

    const engine = createMeetingDetectionEngine({
      activationThresholdMs: 100,
      cooldownMs: 200,
      endGraceMs: 0,
      minRepromptIntervalMs: 5_000,
      staleCandidateThresholdMs: 5_000,
    });

    engine.subscribe((event) => events.push(event));

    const zoom = {
      key: 'desktop:zoom',
      platform: 'zoom' as const,
      kind: 'desktop' as const,
      displayName: 'Zoom',
      processNames: ['zoom'] as string[],
      windowTitle: 'Standup',
    };
    const teams = {
      key: 'desktop:teams',
      platform: 'teams' as const,
      kind: 'desktop' as const,
      displayName: 'Microsoft Teams',
      processNames: ['ms-teams'] as string[],
      windowTitle: 'Sync',
    };

    engine.ingest([zoom], now);
    engine.ingest([zoom], now + 150);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([], now + 300);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1);

    engine.ingest([teams], now + 400);
    engine.ingest([teams], now + 600);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(1);

    engine.ingest([teams], now + 5_400);
    engine.ingest([teams], now + 5_600);
    expect(events.filter((e) => e.type === 'detected')).toHaveLength(2);
  });
});
