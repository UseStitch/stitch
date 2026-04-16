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

function createManager(): ToolsetManager {
  return new ToolsetManager({
    sessionId: 'ses_test' as never,
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
    const tools = createToolsetTools(manager);
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
    const tools = createToolsetTools(manager);
    const result = await tools.activate_toolset.execute?.(
      { toolsetId: 'test-toolset' },
      {} as never,
    );

    expect(result).toMatchObject({
      toolsetId: 'test-toolset',
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
    const tools = createToolsetTools(manager);
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
    const tools = createToolsetTools(manager);
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

  test('list_toolsets throws when unknown toolsetId is requested', async () => {
    const manager = createManager();
    const tools = createToolsetTools(manager);

    await expect(
      tools.list_toolsets.execute?.({ toolsetId: 'missing-toolset' }, {} as never),
    ).rejects.toThrow('Unknown toolset');
  });

  test('activate_toolset throws when unknown toolsetId is requested', async () => {
    const manager = createManager();
    const tools = createToolsetTools(manager);

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
    const tools = createToolsetTools(manager);
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
    const tools = createToolsetTools(manager);
    await tools.activate_toolset.execute?.({ toolsetId: 'no-overlap-a' }, {} as never);
    const result = (await tools.activate_toolset.execute?.(
      { toolsetId: 'no-overlap-b' },
      {} as never,
    )) as { warning?: string; collisions?: string[] };

    expect(result.warning).toBeUndefined();
    expect(result.collisions).toBeUndefined();
  });
});
