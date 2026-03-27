import { describe, expect, test } from 'vitest';

import { usageServiceInternals } from '@/usage/service.js';

describe('usageServiceInternals.inferGranularity', () => {
  test('uses hourly buckets for short ranges', () => {
    const from = Date.UTC(2026, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 0, 2, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('hour');
  });

  test('uses weekly buckets when daily buckets would exceed target count', () => {
    const from = Date.UTC(2026, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 2, 1, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('week');
  });

  test('uses monthly buckets for very long ranges', () => {
    const from = Date.UTC(2025, 0, 1, 0, 0, 0);
    const to = Date.UTC(2026, 0, 1, 0, 0, 0);

    expect(usageServiceInternals.inferGranularity({ from, to })).toBe('month');
  });
});

describe('usageServiceInternals.floorToGranularity', () => {
  test('floors weekly buckets to Monday', () => {
    const thursday = Date.UTC(2026, 2, 26, 15, 30, 0);
    const floor = usageServiceInternals.floorToGranularity(thursday, 'week');

    const date = new Date(floor);
    expect(date.getUTCDay()).toBe(1);
  });
});

describe('usageServiceInternals.buildBucketRanges', () => {
  test('builds continuous non-overlapping daily buckets', () => {
    const from = Date.UTC(2026, 0, 1, 12, 0, 0);
    const to = Date.UTC(2026, 0, 4, 12, 0, 0);
    const buckets = usageServiceInternals.buildBucketRanges({ from, to }, 'day');

    expect(buckets.length).toBe(4);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]?.start).toBe(buckets[i - 1]?.end);
    }
  });
});
