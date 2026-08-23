import { describe, expect, test } from 'bun:test';

import { normalizeMcpToolResult } from '@/mcp/client.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('normalizeMcpToolResult', () => {
  test('converts MCP text errors to the shared tool error shape', () => {
    const result: CallToolResult = {
      isError: true,
      content: [
        { type: 'text', text: 'Request failed' },
        { type: 'text', text: 'Try a different query' },
      ],
    };

    expect(normalizeMcpToolResult(result)).toEqual({ error: 'Request failed\nTry a different query', details: result });
  });

  test('uses a fallback message when error content has no text', () => {
    const result: CallToolResult = { isError: true, content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }] };

    expect(normalizeMcpToolResult(result)).toEqual({ error: 'MCP tool call failed', details: result });
  });

  test('leaves successful MCP results unchanged', () => {
    const result: CallToolResult = { content: [{ type: 'text', text: 'Success' }] };

    expect(normalizeMcpToolResult(result)).toBe(result);
  });
});
