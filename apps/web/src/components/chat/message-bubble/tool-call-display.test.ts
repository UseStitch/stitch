import { describe, expect, test } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { buildStoredToolCallDisplayItems } from '@/components/chat/message-bubble/tool-call-display.js';

type StoredToolResult = StoredPart & { type: 'tool-result' };

function callPart(toolName: string): StoredPart {
  return {
    type: 'tool-call',
    id: 'prt_1',
    toolCallId: 'call-1',
    toolName,
    input: {},
    startedAt: 0,
    endedAt: 1,
  };
}

function resultsFor(output: unknown): Map<string, StoredToolResult> {
  const result: StoredToolResult = {
    type: 'tool-result',
    id: 'prt_2',
    toolCallId: 'call-1',
    toolName: 'bash',
    input: {},
    output,
    truncated: false,
    startedAt: 0,
    endedAt: 1,
  };

  return new Map([['call-1', result]]);
}

function buildOne(toolName: string, output: unknown) {
  return buildStoredToolCallDisplayItems([callPart(toolName)], resultsFor(output), false)[0];
}

describe('buildStoredToolCallDisplayItems', () => {
  test('reports a readable error for a failed bash command that carries no error field', () => {
    const item = buildOne('bash', { title: 'ls', output: 'no such file', failed: true });

    expect(item.status).toBe('error');
    expect(item.error).toBe('Tool execution failed');
  });

  test('surfaces the message from a canonical error result', () => {
    const item = buildOne('read', { error: 'File not found' });

    expect(item.status).toBe('error');
    expect(item.error).toBe('File not found');
  });

  test('treats data results containing an error field as completed', () => {
    const item = buildOne('grep', { error: 'non-fatal', matches: [], total: 0 });

    expect(item.status).toBe('completed');
    expect(item.error).toBeUndefined();
  });

  test('marks a call with no result as errored', () => {
    const item = buildStoredToolCallDisplayItems([callPart('bash')], new Map(), false)[0];

    expect(item.status).toBe('error');
    expect(item.error).toBe('Blocked or failed before completion');
  });

  test('reports an aborted call with no result as interrupted', () => {
    const item = buildStoredToolCallDisplayItems([callPart('bash')], new Map(), true)[0];

    expect(item.error).toBe('Interrupted');
  });
});
