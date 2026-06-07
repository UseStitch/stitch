import { describe, expect, test } from 'bun:test';

import { createSessionId, extractTimestamp } from './index';

function createTestId(): string {
  return createSessionId();
}

describe('id factories', () => {
  test('creates an id with the correct prefix and shape', () => {
    const id = createTestId();
    expect(id.startsWith(`ses_`)).toBe(true);
    const body = id.slice(4);
    // 12 hex chars (time) + 14 base62 chars (random)
    expect(body).toMatch(/^[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  });

  test('generates unique ids across 100 rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createTestId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('extractTimestamp', () => {
  test('returns a positive number', () => {
    const id = createTestId();
    const extracted = extractTimestamp(id);
    expect(extracted).toBeGreaterThan(0);
  });

  test('ids created later have equal or greater timestamps', async () => {
    const first = createTestId();
    await new Promise((r) => setTimeout(r, 2));
    const second = createTestId();

    expect(extractTimestamp(second)).toBeGreaterThanOrEqual(extractTimestamp(first));
  });
});
