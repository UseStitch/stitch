import { beforeEach, describe, expect, test } from 'bun:test';

import { ok } from '@/lib/service-result.js';
import type { McpServerWithTools } from '@/mcp/service.js';
import { getMcpServerPresentation, refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { getToolset, listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';

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

  test('removes stale mcp toolsets that no longer exist', async () => {
    registerToolset({
      id: 'mcp:stale-server',
      kind: 'mcp',
      name: 'Stale',
      description: 'stale',
      tools: () => [],
      activate: async () => ({}),
    });

    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ok([{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
        fetchServerInfo: async () => null,
        fetchServerPrompts: async () => [],
        findRegistryServer: async () => null,
        buildServerPresentation: async () => ({ serverId: TEST_SERVER.id, name: TEST_SERVER.name, tools: {} }),
      },
    );

    expect(listToolsetIds()).not.toContain('mcp:stale-server');
  });

  test('uses registry metadata for MCP toolset name and description', async () => {
    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ok([{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
        fetchServerInfo: async () => null,
        fetchServerPrompts: async () => [],
        findRegistryServer: async () => ({
          id: 'registry-test',
          name: 'Registry Server',
          description: 'Curated registry description for model discovery.',
          docsUrl: 'https://example.com/docs',
          tags: ['search'],
          install: { name: TEST_SERVER.name, transport: 'http', url: TEST_SERVER.url, authConfig: { type: 'none' } },
        }),
        buildServerPresentation: async () => ({
          serverId: TEST_SERVER.id,
          name: 'Registry Server',
          description: 'Curated registry description for model discovery.',
          tools: {},
        }),
      },
    );

    expect(getToolset('mcp:mcp_test_server')).toMatchObject({
      name: 'Registry Server',
      description: 'Curated registry description for model discovery.',
    });
  });

  test('prefers registry display name over noisy live server name', async () => {
    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ok([{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
        fetchServerInfo: async () => ({
          name: 'mcp-typescript server on vercel',
          title: 'mcp-typescript server on vercel',
        }),
        fetchServerPrompts: async () => [],
        findRegistryServer: async () => ({
          id: 'registry-test',
          name: 'Exa',
          description: 'Web and code search tools from Exa.',
          docsUrl: 'https://example.com/docs',
          tags: ['search'],
          install: { name: TEST_SERVER.name, transport: 'http', url: TEST_SERVER.url, authConfig: { type: 'none' } },
        }),
        buildServerPresentation: async () => ({ serverId: TEST_SERVER.id, name: 'Exa', title: 'Exa', tools: {} }),
      },
    );

    expect(getToolset('mcp:mcp_test_server')?.name).toBe('Exa');
  });

  test('attaches presentation to the toolset, registers it under a stable server id, and reads it back through the registry', async () => {
    await refreshMcpToolsets(
      { refreshTools: true },
      {
        getMcpServersWithCachedTools: async () => [TEST_SERVER],
        fetchMcpTools: async () => ok([{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
        fetchServerInfo: async () => null,
        fetchServerPrompts: async () => [],
        findRegistryServer: async () => null,
        buildServerPresentation: async () => ({
          serverId: TEST_SERVER.id,
          name: TEST_SERVER.name,
          iconPath: '/mcp/icons/test',
          tools: { lookup: { title: 'Lookup', iconPath: '/mcp/icons/lookup' } },
        }),
      },
    );

    expect(listToolsetIds()).toContain('mcp:mcp_test_server');
    expect(getToolset('mcp:mcp_test_server')?.presentation).toMatchObject({
      serverId: TEST_SERVER.id,
      iconPath: '/mcp/icons/test',
    });
    expect(getMcpServerPresentation(TEST_SERVER.id)).toMatchObject({
      serverId: TEST_SERVER.id,
      iconPath: '/mcp/icons/test',
    });
  });

  test('removing a stale server also drops its presentation', async () => {
    const deps = {
      fetchMcpTools: async () => ok([{ name: 'lookup', description: 'Lookup data', inputSchema: {} }]),
      fetchServerInfo: async () => null,
      fetchServerPrompts: async () => [],
      findRegistryServer: async () => null,
      buildServerPresentation: async () => ({ serverId: TEST_SERVER.id, name: TEST_SERVER.name, tools: {} }),
    } as const;

    await refreshMcpToolsets(
      { refreshTools: true },
      { ...deps, getMcpServersWithCachedTools: async () => [TEST_SERVER] },
    );
    expect(getMcpServerPresentation(TEST_SERVER.id)).toBeDefined();

    await refreshMcpToolsets({ refreshTools: true }, { ...deps, getMcpServersWithCachedTools: async () => [] });
    expect(getMcpServerPresentation(TEST_SERVER.id)).toBeUndefined();
  });
});
