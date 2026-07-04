import { describe, expect, test } from 'bun:test';

import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';

describe('formatCost', () => {
  test('shows exact zero without decimal precision', () => {
    expect(formatCost(0)).toBe('$0');
  });

  test('shows non-zero sub-cent costs', () => {
    expect(formatCost(0.00154245)).toBe('$0.0015');
  });

  test('trims trailing zeroes from sub-cent costs', () => {
    expect(formatCost(0.001)).toBe('$0.001');
  });

  test('preserves tiny non-zero costs', () => {
    expect(formatCost(0.00001234)).toBe('$0.000012');
  });

  test('uses cent precision for cent-level costs', () => {
    expect(formatCost(0.1740201167)).toBe('$0.17');
  });
});
