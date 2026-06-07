import { describe, expect, it } from 'bun:test';

import { getToolsetSource } from '@/routes/config.js';

describe('config route toolset source classification', () => {
  it('returns the explicit toolset kind', () => {
    expect(getToolsetSource({ kind: 'native' })).toBe('native');
    expect(getToolsetSource({ kind: 'connector' })).toBe('connector');
    expect(getToolsetSource({ kind: 'mcp' })).toBe('mcp');
    expect(getToolsetSource({ kind: 'provider' })).toBe('provider');
  });
});
