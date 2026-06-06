import { beforeEach, describe, expect, test } from 'bun:test';

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

describe('ToolsetManager.activate collision detection', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('returns empty collisions when no overlap exists', async () => {
    registerToolset({
      id: 'ts-a',
      name: 'A',
      description: 'A',
      tools: () => [{ name: 'tool_a', description: 'a' }],
      activate: async () => ({ tool_a: makeTool('a') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-b',
      name: 'B',
      description: 'B',
      tools: () => [{ name: 'tool_b', description: 'b' }],
      activate: async () => ({ tool_b: makeTool('b') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-a');
    const result = await manager.activate('ts-b');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual([]);
  });

  test('reports collisions when two toolsets share a tool name', async () => {
    registerToolset({
      id: 'ts-x',
      name: 'X',
      description: 'X',
      tools: () => [{ name: 'search', description: 'search' }],
      activate: async () => ({ search: makeTool('search from X') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-y',
      name: 'Y',
      description: 'Y',
      tools: () => [
        { name: 'search', description: 'search' },
        { name: 'list', description: 'list' },
      ],
      activate: async () => ({
        search: makeTool('search from Y'),
        list: makeTool('list from Y'),
      }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-x');
    const result = await manager.activate('ts-y');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual(['search']);
  });

  test('returns no collisions when activating the first toolset', async () => {
    registerToolset({
      id: 'ts-only',
      name: 'Only',
      description: 'Only',
      tools: () => [{ name: 'tool_a', description: 'a' }],
      activate: async () => ({ tool_a: makeTool('a') }),
    } satisfies Toolset);

    const manager = createManager();
    const result = await manager.activate('ts-only');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual([]);
  });

  test('already-active toolset returns empty collisions', async () => {
    registerToolset({
      id: 'ts-once',
      name: 'Once',
      description: 'Once',
      tools: () => [{ name: 'tool_a', description: 'a' }],
      activate: async () => ({ tool_a: makeTool('a') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-once');
    const result = await manager.activate('ts-once');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual([]);
  });
});

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

    expect(Object.keys(manager1.getActiveTools())).toEqual(Object.keys(manager2.getActiveTools()));
    expect(Object.keys(manager1.getActiveTools())).toEqual(['a_tool', 'b_tool']);
  });
});

describe('ToolsetManager activation state', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('tracks persisted active toolsets separately from run-only toolsets', async () => {
    registerToolset({
      id: 'persisted',
      name: 'Persisted',
      description: 'Persisted',
      tools: () => [{ name: 'persisted_tool', description: 'persisted' }],
      activate: async () => ({ persisted_tool: makeTool('persisted') }),
    } satisfies Toolset);
    registerToolset({
      id: 'run-only',
      name: 'Run Only',
      description: 'Run only',
      tools: () => [{ name: 'run_tool', description: 'run' }],
      activate: async () => ({ run_tool: makeTool('run') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('persisted');
    await manager.activate('run-only');
    manager.pin('persisted');

    expect(manager.getActivationState()).toEqual([{ id: 'persisted', scope: 'until_deactivated' }]);
    expect(manager.getExpiredRunToolsets()).toEqual([{ id: 'run-only', toolNames: ['run_tool'] }]);
  });

  test('renews TTL state when a tool from a TTL toolset is used', async () => {
    registerToolset({
      id: 'ttl-toolset',
      name: 'TTL',
      description: 'TTL',
      tools: () => [{ name: 'ttl_tool', description: 'ttl' }],
      activate: async () => ({ ttl_tool: makeTool('ttl') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      {
        sessionId: 'ses_test' as never,
        messageId: 'msg_test' as never,
        streamRunId: 'run_test',
      },
      [{ id: 'ttl-toolset', scope: 'ttl_turns', expiresAtTurn: 1 }],
    );
    await manager.activate('ttl-toolset');

    expect(manager.renewTtlForTool('ttl_tool', 5)).toBe('ttl-toolset');
    expect(manager.getActivationState()).toEqual([
      { id: 'ttl-toolset', scope: 'ttl_turns', expiresAtTurn: 5 },
    ]);
  });
});
