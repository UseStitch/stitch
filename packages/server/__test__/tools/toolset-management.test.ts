import { beforeEach, describe, expect, test } from 'vitest';

import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

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
});
