import { beforeEach, describe, expect, test } from 'vitest';
import type { Tool } from 'ai';

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

function makeTool(description: string): Tool {
  return { description, parameters: { type: 'object', properties: {} } } as unknown as Tool;
}

describe('ToolsetManager.getActiveTools ordering', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('returns tools sorted alphabetically by key', async () => {
    registerToolset({
      id: 'ts-alpha',
      name: 'Alpha',
      description: 'Alpha toolset',
      tools: () => [
        { name: 'zebra_tool', description: 'z' },
        { name: 'apple_tool', description: 'a' },
      ],
      activate: async () => ({
        zebra_tool: makeTool('z'),
        apple_tool: makeTool('a'),
      }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-beta',
      name: 'Beta',
      description: 'Beta toolset',
      tools: () => [{ name: 'mango_tool', description: 'm' }],
      activate: async () => ({
        mango_tool: makeTool('m'),
      }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-alpha');
    await manager.activate('ts-beta');

    const keys = Object.keys(manager.getActiveTools());
    expect(keys).toEqual(['apple_tool', 'mango_tool', 'zebra_tool']);
  });

  test('activation order does not affect key order', async () => {
    registerToolset({
      id: 'ts-first',
      name: 'First',
      description: 'First',
      tools: () => [{ name: 'b_tool', description: 'b' }],
      activate: async () => ({ b_tool: makeTool('b') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-second',
      name: 'Second',
      description: 'Second',
      tools: () => [{ name: 'a_tool', description: 'a' }],
      activate: async () => ({ a_tool: makeTool('a') }),
    } satisfies Toolset);

    const manager1 = createManager();
    await manager1.activate('ts-first');
    await manager1.activate('ts-second');

    const manager2 = createManager();
    await manager2.activate('ts-second');
    await manager2.activate('ts-first');

    expect(Object.keys(manager1.getActiveTools())).toEqual(
      Object.keys(manager2.getActiveTools()),
    );
    expect(Object.keys(manager1.getActiveTools())).toEqual(['a_tool', 'b_tool']);
  });
});
