import { afterEach, describe, expect, it } from 'vitest';

import type { Mention } from '@stitch/shared/chat/mentions';
import { encodeMentions, parseMentions, stripMentionTokens } from '@stitch/shared/chat/mentions';

import {
  buildMentionContextBlock,
  getMentionSuggestions,
  resolveMentionToolsetIds,
} from '@/chat/mentions-service.js';
import { registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

function makeToolset(id: string, name: string, description = 'A test toolset'): Toolset {
  return {
    id,
    name,
    description,
    tools: () => [],
    activate: async () => ({}),
  };
}

describe('getMentionSuggestions', () => {
  afterEach(() => {
    unregisterToolset('test-toolset-1');
    unregisterToolset('test-toolset-2');
    unregisterToolset('mcp:test-server');
  });

  it('returns all registered toolsets when query is empty', () => {
    registerToolset(makeToolset('test-toolset-1', 'Gmail'));
    const results = getMentionSuggestions('');
    const ids = results.map((r) => r.id);
    expect(ids).toContain('test-toolset-1');
  });

  it('filters toolsets by name query', () => {
    registerToolset(makeToolset('test-toolset-1', 'Gmail'));
    registerToolset(makeToolset('test-toolset-2', 'Slack'));
    const results = getMentionSuggestions('gmail');
    expect(results.some((r) => r.label === 'Gmail')).toBe(true);
    expect(results.some((r) => r.label === 'Slack')).toBe(false);
  });

  it('assigns correct type for MCP toolsets', () => {
    registerToolset(makeToolset('mcp:test-server', 'Test MCP Server'));
    const results = getMentionSuggestions('test mcp');
    const mcp = results.find((r) => r.id === 'mcp:test-server');
    expect(mcp?.type).toBe('mcp_server');
    expect(mcp?.category).toBe('MCP Servers');
  });

  it('assigns toolset type for native toolsets', () => {
    registerToolset(makeToolset('test-toolset-1', 'My Toolset'));
    const results = getMentionSuggestions('my toolset');
    const ts = results.find((r) => r.id === 'test-toolset-1');
    expect(ts?.type).toBe('toolset');
    expect(ts?.category).toBe('Toolsets');
  });
});

describe('resolveMentionToolsetIds', () => {
  it('returns unique toolset IDs from mentions', () => {
    const mentions: Mention[] = [
      { type: 'toolset', id: 'browser', label: 'Browser' },
      { type: 'mcp_server', id: 'mcp:deepwiki', label: 'DeepWiki' },
      { type: 'toolset', id: 'browser', label: 'Browser' },
    ];
    expect(resolveMentionToolsetIds(mentions)).toEqual(['browser', 'mcp:deepwiki']);
  });

  it('returns empty array for no mentions', () => {
    expect(resolveMentionToolsetIds([])).toEqual([]);
  });
});

describe('buildMentionContextBlock', () => {
  it('returns empty string for no mentions', () => {
    expect(buildMentionContextBlock([])).toBe('');
  });

  it('includes mention labels in the context block', () => {
    const mentions: Mention[] = [
      { type: 'toolset', id: 'browser', label: 'Browser' },
      { type: 'mcp_server', id: 'mcp:deepwiki', label: 'DeepWiki' },
    ];
    const block = buildMentionContextBlock(mentions);
    expect(block).toContain('<mention_context>');
    expect(block).toContain('Browser');
    expect(block).toContain('DeepWiki');
    expect(block).toContain('</mention_context>');
  });
});

describe('encodeMentions / parseMentions / stripMentionTokens', () => {
  it('encodes mentions as inline tokens appended to text', () => {
    const mentions: Mention[] = [{ type: 'toolset', id: 'browser', label: 'Browser' }];
    const encoded = encodeMentions('search the web', mentions);
    expect(encoded).toBe('search the web @[Browser](toolset:browser)');
  });

  it('encodes multiple mentions', () => {
    const mentions: Mention[] = [
      { type: 'toolset', id: 'browser', label: 'Browser' },
      { type: 'mcp_server', id: 'mcp:dw', label: 'DeepWiki' },
    ];
    const encoded = encodeMentions('hello', mentions);
    expect(encoded).toContain('@[Browser](toolset:browser)');
    expect(encoded).toContain('@[DeepWiki](mcp_server:mcp:dw)');
  });

  it('returns text unchanged when no mentions', () => {
    expect(encodeMentions('hello world', [])).toBe('hello world');
  });

  it('parses mentions back from encoded text', () => {
    const mentions: Mention[] = [
      { type: 'toolset', id: 'browser', label: 'Browser' },
      { type: 'mcp_server', id: 'mcp:dw', label: 'DeepWiki' },
    ];
    const encoded = encodeMentions('do this', mentions);
    const parsed = parseMentions(encoded);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ type: 'toolset', id: 'browser', label: 'Browser' });
    expect(parsed[1]).toEqual({ type: 'mcp_server', id: 'mcp:dw', label: 'DeepWiki' });
  });

  it('returns empty array when no tokens present', () => {
    expect(parseMentions('just plain text')).toEqual([]);
  });

  it('strips tokens leaving clean display text', () => {
    const encoded = 'search the web @[Browser](toolset:browser)';
    expect(stripMentionTokens(encoded)).toBe('search the web');
  });

  it('encode → parse → strip round-trip', () => {
    const original = 'do something useful';
    const mentions: Mention[] = [
      { type: 'connector_service', id: 'connector:gh', label: 'GitHub' },
    ];
    const encoded = encodeMentions(original, mentions);
    const parsed = parseMentions(encoded);
    const stripped = stripMentionTokens(encoded);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('connector:gh');
    expect(stripped).toBe(original);
  });
});
