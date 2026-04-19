import { afterEach, describe, expect, it } from 'vitest';

import { getMentionSuggestions } from '@/chat/mentions-service.js';
import { registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

function makeToolset(id: string, name: string, description = 'desc'): Toolset {
  return {
    id,
    name,
    description,
    tools: () => [],
    activate: async () => ({}),
  };
}

describe('mentions suggestions route (service layer)', () => {
  afterEach(() => {
    unregisterToolset('mention-route-test-1');
    unregisterToolset('mention-route-test-mcp');
  });

  it('returns suggestions matching the query parameter', () => {
    registerToolset(makeToolset('mention-route-test-1', 'Route Test Toolset', 'Does route things'));
    const results = getMentionSuggestions('route test');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.label).toBe('Route Test Toolset');
  });

  it('returns MCP suggestions with correct category', () => {
    registerToolset(makeToolset('mention-route-test-mcp', 'MCP Route Tool'));
    const results = getMentionSuggestions('mcp route');
    const match = results.find((r) => r.id === 'mention-route-test-mcp');
    expect(match?.category).toBe('Toolsets');
    expect(match?.type).toBe('toolset');
  });

  it('returns all suggestions when query is empty', () => {
    registerToolset(makeToolset('mention-route-test-1', 'Route Test Toolset'));
    const all = getMentionSuggestions('');
    const ids = all.map((r) => r.id);
    expect(ids).toContain('mention-route-test-1');
  });
});
