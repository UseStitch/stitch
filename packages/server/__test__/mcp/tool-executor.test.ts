import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';

vi.mock('@/mcp/service.js', () => ({
  getMcpServersWithCachedTools: vi.fn(async () => [
    {
      id: 'mcp_test_server',
      name: 'My MCP Server',
      transport: 'http',
      url: 'https://example.com/mcp',
      authConfig: { type: 'none' },
      tools: [{ name: 'lookup', description: 'Lookup data', inputSchema: {} }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]),
  fetchMcpTools: vi.fn(async () => [{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
}));

vi.mock('@/mcp/client.js', () => ({
  getMcpClient: vi.fn(async () => ({
    experimental_listPrompts: async () => ({ prompts: [] }),
  })),
  withMcpClient: vi.fn(),
  evictMcpClient: vi.fn(),
}));

vi.mock('@/mcp/icons.js', () => ({
  cacheMcpIcon: vi.fn(async () => null),
}));

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

describe('refreshMcpToolsets', () => {
  beforeEach(() => {
    clearToolsets();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('registers MCP toolsets using stable server id', async () => {
    await refreshMcpToolsets({ refreshTools: true });
    expect(listToolsetIds()).toContain('mcp:mcp_test_server');
  });

  test('removes stale mcp toolsets that no longer exist', async () => {
    registerToolset({
      id: 'mcp:stale-server',
      name: 'Stale',
      description: 'stale',
      tools: () => [],
      activate: async () => ({}),
    });

    await refreshMcpToolsets({ refreshTools: true });
    expect(listToolsetIds()).not.toContain('mcp:stale-server');
  });
});
