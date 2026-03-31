import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createPermissionRuleId,
  createMessageId,
  createPartId,
  createPermissionResponseId,
  createQuestionId,
  createSessionId,
  createToolResultId,
  extractTimestamp,
} from '@stitch/shared/id';

describe('id helpers', () => {
  const TIMESTAMP_MASK = (1n << 36n) - 1n;

  afterEach(() => {
    vi.useRealTimers();
  });

  test('creates ids with expected prefixes and shape', () => {
    const cases = [
      { create: createSessionId, prefix: 'ses' },
      { create: createMessageId, prefix: 'msg' },
      { create: createPartId, prefix: 'prt' },
      { create: createToolResultId, prefix: 'toolres' },
      { create: createQuestionId, prefix: 'quest' },
      { create: createPermissionResponseId, prefix: 'permres' },
      { create: createPermissionRuleId, prefix: 'perm' },
    ] as const;

    for (const { create, prefix } of cases) {
      const id = create();
      expect(id).toMatch(new RegExp(`^${prefix}_[0-9a-f]{12}[0-9A-Za-z]{14}$`));
    }
  });

  test('extracts timestamp from generated id', () => {
    const now = new Date('2026-03-17T12:34:56.789Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const id = createMessageId();

    expect(extractTimestamp(id)).toBe(Number(BigInt(now.getTime()) & TIMESTAMP_MASK));
  });

  test('keeps ids unique within the same millisecond', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:34:56.789Z'));

    const first = createPartId();
    const second = createPartId();

    expect(first).not.toBe(second);
    expect(extractTimestamp(first)).toBe(extractTimestamp(second));
  });
});
