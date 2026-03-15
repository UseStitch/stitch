import { describe, test, expect } from 'vitest';

import { stableStringify } from '@/utils/stable-stringify.js';

describe('stableStringify', () => {
  test('produces identical output regardless of top-level key order', () => {
    const a = stableStringify({ path: 'a.ts', recursive: true });
    const b = stableStringify({ recursive: true, path: 'a.ts' });
    expect(a).toBe(b);
  });

  test('produces identical output regardless of nested key order', () => {
    const a = stableStringify({ options: { recursive: true, depth: 3 }, path: 'a.ts' });
    const b = stableStringify({ path: 'a.ts', options: { depth: 3, recursive: true } });
    expect(a).toBe(b);
  });

  test('preserves array order', () => {
    const a = stableStringify({ items: [1, 2, 3] });
    const b = stableStringify({ items: [3, 2, 1] });
    expect(a).not.toBe(b);
  });

  test('handles null, undefined, and primitive values', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(true)).toBe('true');
  });

  test('handles objects nested inside arrays', () => {
    const a = stableStringify([{ b: 2, a: 1 }]);
    const b = stableStringify([{ a: 1, b: 2 }]);
    expect(a).toBe(b);
  });
});
