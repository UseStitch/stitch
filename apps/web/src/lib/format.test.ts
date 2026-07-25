import { describe, expect, it } from 'bun:test';

import { formatTimeAgo } from './format';

describe('formatTimeAgo', () => {
  const now = new Date('2026-01-01T12:00:00Z').getTime();
  const ago = (ms: number) => formatTimeAgo(new Date(now - ms), now);

  it('collapses the first few seconds', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(4_400)).toBe('just now');
  });

  it('clamps future timestamps caused by server clock skew', () => {
    expect(formatTimeAgo(new Date(now + 60_000), now)).toBe('just now');
  });

  it('scales through every unit', () => {
    expect(ago(30_000)).toBe('30s ago');
    expect(ago(90_000)).toBe('1m ago');
    expect(ago(2 * 3_600_000)).toBe('2h ago');
    expect(ago(3 * 86_400_000)).toBe('3d ago');
  });
});
