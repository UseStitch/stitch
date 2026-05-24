import { describe, expect, it } from 'bun:test';

import { getToolsetSource } from '@/routes/config.js';

describe('config route toolset source classification', () => {
  it('classifies built-in toolsets as native', () => {
    expect(getToolsetSource('browser')).toBe('native');
    expect(getToolsetSource('agenda')).toBe('native');
    expect(getToolsetSource('session-history')).toBe('native');
    expect(getToolsetSource('recordings')).toBe('native');
  });

  it('classifies MCP toolsets by prefix', () => {
    expect(getToolsetSource('mcp:deepwiki')).toBe('mcp');
  });

  it('falls back to provider when toolset id is unknown', () => {
    expect(getToolsetSource('unknown-toolset')).toBe('provider');
  });
});
