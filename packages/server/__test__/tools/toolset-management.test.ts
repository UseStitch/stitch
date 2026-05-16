import { beforeEach, describe, expect, test } from 'vitest';

import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

const TEST_SESSION_ID = 'ses_test' as never;

function createManager(): ToolsetManager {
  return new ToolsetManager({
    sessionId: TEST_SESSION_ID,
    messageId: 'msg_test' as never,
    streamRunId: 'run_test',
  });
}

function makeTool(description: string): Tool {
  return { description, parameters: { type: 'object', properties: {} } } as unknown as Tool;
}

function registerTestToolset(overrides: Partial<Toolset> = {}): Toolset {
  const toolset: Toolset = {
    id: 'test-toolset',
    name: 'Test Toolset',
    description: 'Test-only toolset',
    instructions: 'Use this toolset carefully.',
    prompts: [{ name: 'demo', description: 'Demo prompt' }],
    tools: () => [{ name: 'test_tool', description: 'Test tool' }],
    activate: async () => ({}),
    ...overrides,
  };

  registerToolset(toolset);
  return toolset;
}

describe('toolset management tools', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('list_toolsets returns catalog when called without toolsetId', async () => {
    registerTestToolset();
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    const result = await tools.list_toolsets.execute?.({}, {} as never);

    expect(result).toMatchObject({
      toolsets: [
        {
          id: 'test-toolset',
          name: 'Test Toolset',
          active: false,
          hasInstructions: true,
          promptCount: 1,
        },
      ],
    });
  });

  test('activate_toolset omits verbose details by default', async () => {
    registerTestToolset();
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    const result = await tools.activate_toolset.execute?.(
      { toolsetId: 'test-toolset' },
      {} as never,
    );

    expect(result).toMatchObject({
      toolsetId: 'test-toolset',
      toolsetName: 'Test Toolset',
      status: 'activated',
      hasInstructions: true,
      promptCount: 1,
      instructions: null,
      prompts: null,
    });
    expect((result as { message: string }).message).toContain(
      'Call deactivate_toolset("test-toolset") when you no longer need it',
    );
  });

  test('activate_toolset already_active response does not include deactivation nudge', async () => {
    registerTestToolset();
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    await tools.activate_toolset.execute?.({ toolsetId: 'test-toolset' }, {} as never);
    const result = await tools.activate_toolset.execute?.(
      { toolsetId: 'test-toolset' },
      {} as never,
    );

    expect((result as { status: string }).status).toBe('already_active');
    expect((result as { message: string }).message).not.toContain('deactivate_toolset');
  });

  test('activate_toolset includes details when verbose=true', async () => {
    registerTestToolset();
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    const result = await tools.activate_toolset.execute?.(
      {
        toolsetId: 'test-toolset',
        verbose: true,
      },
      {} as never,
    );

    expect(result).toMatchObject({
      toolsetId: 'test-toolset',
      status: 'activated',
      instructions: 'Use this toolset carefully.',
      prompts: [{ name: 'demo', description: 'Demo prompt' }],
    });
  });

  test('activate_toolset humanizes MCP tool names in message', async () => {
    registerTestToolset({
      id: 'mcp:mcp_12345678901234567890123456',
      name: 'Exa',
      tools: () => [
        {
          name: 'mcp_12345678901234567890123456_web_search_exa',
          description: 'Search the web',
        },
      ],
      activate: async () => ({
        mcp_12345678901234567890123456_web_search_exa: makeTool('Search the web'),
      }),
    });
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    const result = (await tools.activate_toolset.execute?.(
      { toolsetId: 'mcp:mcp_12345678901234567890123456' },
      {} as never,
    )) as { message: string; toolsetName: string; toolDisplayNames: string[] };

    expect(result.toolsetName).toBe('Exa');
    expect(result.toolDisplayNames).toEqual(['Web Search Exa']);
    expect(result.message).toContain('Toolset "Exa" activated');
    expect(result.message).not.toContain('mcp_12345678901234567890123456_web_search_exa');
  });

  test('list_toolsets throws when unknown toolsetId is requested', async () => {
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);

    await expect(
      tools.list_toolsets.execute?.({ toolsetId: 'missing-toolset' }, {} as never),
    ).rejects.toThrow('Unknown toolset');
  });

  test('activate_toolset throws when unknown toolsetId is requested', async () => {
    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);

    await expect(
      tools.activate_toolset.execute?.({ toolsetId: 'missing-toolset' }, {} as never),
    ).rejects.toThrow('Unknown toolset');
  });

  test('activate_toolset includes warning and collisions when tool names overlap', async () => {
    registerToolset({
      id: 'first-toolset',
      name: 'First',
      description: 'First toolset',
      tools: () => [{ name: 'search', description: 'search' }],
      activate: async () => ({ search: makeTool('search from first') }),
    } satisfies Toolset);

    registerToolset({
      id: 'second-toolset',
      name: 'Second',
      description: 'Second toolset',
      tools: () => [
        { name: 'search', description: 'search' },
        { name: 'list', description: 'list' },
      ],
      activate: async () => ({
        search: makeTool('search from second'),
        list: makeTool('list from second'),
      }),
    } satisfies Toolset);

    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    await tools.activate_toolset.execute?.({ toolsetId: 'first-toolset' }, {} as never);
    const result = (await tools.activate_toolset.execute?.(
      { toolsetId: 'second-toolset' },
      {} as never,
    )) as { warning?: string; collisions?: string[] };

    expect(result.warning).toContain('search');
    expect(result.collisions).toEqual(['search']);
  });

  test('activate_toolset omits warning and collisions when no overlap exists', async () => {
    registerToolset({
      id: 'no-overlap-a',
      name: 'A',
      description: 'A',
      tools: () => [{ name: 'tool_a', description: 'a' }],
      activate: async () => ({ tool_a: makeTool('a') }),
    } satisfies Toolset);

    registerToolset({
      id: 'no-overlap-b',
      name: 'B',
      description: 'B',
      tools: () => [{ name: 'tool_b', description: 'b' }],
      activate: async () => ({ tool_b: makeTool('b') }),
    } satisfies Toolset);

    const manager = createManager();
    const tools = createToolsetTools(manager, TEST_SESSION_ID);
    await tools.activate_toolset.execute?.({ toolsetId: 'no-overlap-a' }, {} as never);
    const result = (await tools.activate_toolset.execute?.(
      { toolsetId: 'no-overlap-b' },
      {} as never,
    )) as { warning?: string; collisions?: string[] };

    expect(result.warning).toBeUndefined();
    expect(result.collisions).toBeUndefined();
  });

  describe('list_toolsets query filtering', () => {
    beforeEach(() => {
      clearToolsets();
      registerToolset({
        id: 'browser-toolset',
        name: 'Browser',
        description: 'Control a headless browser',
        tools: () => [],
        activate: async () => ({}),
      } satisfies Toolset);
      registerToolset({
        id: 'database-toolset',
        name: 'Database',
        description: 'Query and manage SQL databases',
        tools: () => [],
        activate: async () => ({}),
      } satisfies Toolset);
      registerToolset({
        id: 'email-sender',
        name: 'Email',
        description: 'Send and receive messages',
        tools: () => [],
        activate: async () => ({}),
      } satisfies Toolset);
    });

    test('filters by name match', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.({ query: 'browser' }, {} as never)) as {
        toolsets: { id: string }[];
        totalAvailable: number;
      };

      expect(result.toolsets).toHaveLength(1);
      expect(result.toolsets[0].id).toBe('browser-toolset');
      expect(result.totalAvailable).toBe(3);
    });

    test('filters by description match', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.({ query: 'sql' }, {} as never)) as {
        toolsets: { id: string }[];
        totalAvailable: number;
      };

      expect(result.toolsets).toHaveLength(1);
      expect(result.toolsets[0].id).toBe('database-toolset');
      expect(result.totalAvailable).toBe(3);
    });

    test('filters by id match', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.(
        { query: 'email-sender' },
        {} as never,
      )) as {
        toolsets: { id: string }[];
        totalAvailable: number;
      };

      expect(result.toolsets).toHaveLength(1);
      expect(result.toolsets[0].id).toBe('email-sender');
      expect(result.totalAvailable).toBe(3);
    });

    test('returns empty array with totalAvailable when no match', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.(
        { query: 'xyz_nomatch' },
        {} as never,
      )) as {
        toolsets: unknown[];
        totalAvailable: number;
      };

      expect(result.toolsets).toHaveLength(0);
      expect(result.totalAvailable).toBe(3);
    });

    test('returns full catalog without totalAvailable when no query provided', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.({}, {} as never)) as {
        toolsets: { id: string }[];
        totalAvailable?: number;
      };

      expect(result.toolsets).toHaveLength(3);
      expect(result.totalAvailable).toBeUndefined();
    });

    test('toolsetId takes precedence over query when both provided', async () => {
      const manager = createManager();
      const tools = createToolsetTools(manager, TEST_SESSION_ID);
      const result = (await tools.list_toolsets.execute?.(
        { toolsetId: 'browser-toolset', query: 'database' },
        {} as never,
      )) as { toolsetId: string };

      expect(result.toolsetId).toBe('browser-toolset');
    });
  });
});
