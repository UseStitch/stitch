import { describe, test, expect } from 'vitest';

import { estimate } from '@/utils/token.js';

describe('estimate', () => {
  test('returns 0 for null', () => {
    expect(estimate(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(estimate(undefined)).toBe(0);
  });

  test('estimates string tokens as ceil(length / 4)', () => {
    expect(estimate('hello')).toBe(2); // 5 / 4 = 1.25 → 2
    expect(estimate('abcd')).toBe(1); // 4 / 4 = 1
    expect(estimate('')).toBe(0);
  });

  test('stringifies objects before estimating', () => {
    const obj = { key: 'value' };
    const json = JSON.stringify(obj);
    expect(estimate(obj)).toBe(Math.ceil(json.length / 4));
  });

  test('handles numbers', () => {
    expect(estimate(12345)).toBe(Math.ceil('12345'.length / 4));
  });
});