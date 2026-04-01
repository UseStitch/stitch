import { beforeEach, describe, expect, test } from 'vitest';

import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import type { McpServerWithTools } from '@/mcp/service.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

const TEST_SERVER: McpServerWithTools = {
  id: 'mcp_test_server',
  name: 'My MCP Server',
  url: 'https://example.com/mcp',
  authConfig: { type: 'none' as const },
  tools: [{ name: 'lookup', description: 'Lookup data', inputSchema: {} }],
};

describe('refreshMcpToolsets', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('registers MCP toolsets using stable server id', async () => {
    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ({
          data: [{ name: 'lookup', description: 'Lookup data', inputSchema: {} }],
        }),
        fetchServerInfo: async () => null,
        fetchServerPrompts: async () => [],
        buildServerPresentation: async () => ({
          serverId: TEST_SERVER.id,
          name: TEST_SERVER.name,
          tools: {},
        }),
      },
    );

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

    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ({
          data: [{ name: 'lookup', description: 'Lookup data', inputSchema: {} }],
        }),
        fetchServerInfo: async () => null,
        fetchServerPrompts: async () => [],
        buildServerPresentation: async () => ({
          serverId: TEST_SERVER.id,
          name: TEST_SERVER.name,
          tools: {},
        }),
      },
    );

    expect(listToolsetIds()).not.toContain('mcp:stale-server');
  });
});
