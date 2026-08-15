import { jsonSchema } from 'ai';
import { beforeEach, describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

setupTestDb();

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
  return { description, inputSchema: jsonSchema({ type: 'object', properties: {} }) };
}

describe('ToolsetManager.activate collision detection', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('returns empty collisions when no overlap exists', async () => {
    registerToolset({
      id: 'ts-a',
      kind: 'native',
      name: 'A',
      description: 'A',
      tools: () => [{ name: 'tool_a', description: 'a' }],
      activate: async () => ({ tool_a: makeTool('a') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-b',
      kind: 'native',
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
      kind: 'native',
      name: 'X',
      description: 'X',
      tools: () => [{ name: 'search', description: 'search' }],
      activate: async () => ({ search: makeTool('search from X') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-y',
      kind: 'native',
      name: 'Y',
      description: 'Y',
      tools: () => [
        { name: 'search', description: 'search' },
        { name: 'list', description: 'list' },
      ],
      activate: async () => ({ search: makeTool('search from Y'), list: makeTool('list from Y') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-x');
    const result = await manager.activate('ts-y');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual(['search']);
  });

  test('does not report stale collisions after deactivation', async () => {
    registerToolset({
      id: 'ts-x',
      kind: 'native',
      name: 'X',
      description: 'X',
      tools: () => [{ name: 'search', description: 'search' }],
      activate: async () => ({ search: makeTool('search from X') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-y',
      kind: 'native',
      name: 'Y',
      description: 'Y',
      tools: () => [{ name: 'search', description: 'search' }],
      activate: async () => ({ search: makeTool('search from Y') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('ts-x');
    manager.deactivate('ts-x');
    const result = await manager.activate('ts-y');

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.collisions).toEqual([]);
  });

  test('returns no collisions when activating the first toolset', async () => {
    registerToolset({
      id: 'ts-only',
      kind: 'native',
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
      kind: 'native',
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
      kind: 'native',
      name: 'Alpha',
      description: 'Alpha toolset',
      tools: () => [
        { name: 'zebra_tool', description: 'z' },
        { name: 'apple_tool', description: 'a' },
      ],
      activate: async () => ({ zebra_tool: makeTool('z'), apple_tool: makeTool('a') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-beta',
      kind: 'native',
      name: 'Beta',
      description: 'Beta toolset',
      tools: () => [{ name: 'mango_tool', description: 'm' }],
      activate: async () => ({ mango_tool: makeTool('m') }),
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
      kind: 'native',
      name: 'First',
      description: 'First',
      tools: () => [{ name: 'b_tool', description: 'b' }],
      activate: async () => ({ b_tool: makeTool('b') }),
    } satisfies Toolset);

    registerToolset({
      id: 'ts-second',
      kind: 'native',
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
      kind: 'native',
      name: 'Persisted',
      description: 'Persisted',
      tools: () => [{ name: 'persisted_tool', description: 'persisted' }],
      activate: async () => ({ persisted_tool: makeTool('persisted') }),
    } satisfies Toolset);
    registerToolset({
      id: 'run-only',
      kind: 'native',
      name: 'Run Only',
      description: 'Run only',
      tools: () => [{ name: 'run_tool', description: 'run' }],
      activate: async () => ({ run_tool: makeTool('run') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('persisted');
    await manager.activate('run-only');
    manager.pin('persisted');

    expect(manager.getPersistableActivationState()).toEqual([{ id: 'persisted', scope: 'until_deactivated' }]);
    expect(manager.getPersistedIds()).toEqual(new Set(['persisted']));
    expect(manager.getExpiredRunToolsets()).toEqual([{ id: 'run-only', toolNames: ['run_tool'] }]);
  });

  test('preserves restored persisted state before activation', async () => {
    registerToolset({
      id: 'restored',
      kind: 'native',
      name: 'Restored',
      description: 'Restored',
      tools: () => [{ name: 'restored_tool', description: 'restored' }],
      activate: async () => ({ restored_tool: makeTool('restored') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [{ id: 'restored', scope: 'until_deactivated' }],
    );

    expect(manager.isActive('restored')).toBe(false);
    expect(manager.isPersisted('restored')).toBe(true);
    expect(manager.getActiveIds()).toEqual(new Set());
    expect(manager.getPersistedIds()).toEqual(new Set(['restored']));

    const catalog = await manager.getCatalogWithState();
    expect(catalog.find((entry) => entry.id === 'restored')).toMatchObject({ active: false, persisted: true });
  });

  test('can unpin restored persisted state before activation', async () => {
    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [{ id: 'restored', scope: 'until_deactivated' }],
    );

    expect(manager.unpin('restored')).toBe(true);
    expect(manager.isPersisted('restored')).toBe(false);
    expect(manager.getPersistedIds()).toEqual(new Set());
    expect(manager.getPersistableActivationState()).toEqual([]);
  });

  test('deactivation removes activated restored state', async () => {
    registerToolset({
      id: 'restored',
      kind: 'native',
      name: 'Restored',
      description: 'Restored',
      tools: () => [{ name: 'restored_tool', description: 'restored' }],
      activate: async () => ({ restored_tool: makeTool('restored') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [{ id: 'restored', scope: 'until_deactivated' }],
    );

    await manager.activate('restored');
    expect(manager.deactivate('restored')).toBe(true);

    expect(manager.isActive('restored')).toBe(false);
    expect(manager.isPersisted('restored')).toBe(false);
    expect(manager.getActiveIds()).toEqual(new Set());
    expect(manager.getPersistedIds()).toEqual(new Set());
    expect(manager.getPersistableActivationState()).toEqual([]);
    expect(manager.getActiveTools()).toEqual({});
  });

  test('renews TTL state when a tool from a TTL toolset is used', async () => {
    registerToolset({
      id: 'ttl-toolset',
      kind: 'native',
      name: 'TTL',
      description: 'TTL',
      tools: () => [{ name: 'ttl_tool', description: 'ttl' }],
      activate: async () => ({ ttl_tool: makeTool('ttl') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [{ id: 'ttl-toolset', scope: 'ttl_turns', expiresAtTurn: 1 }],
    );
    await manager.activate('ttl-toolset');

    expect(manager.renewTtlForTool('ttl_tool', 5)).toBe('ttl-toolset');
    expect(manager.getPersistableActivationState()).toEqual([
      { id: 'ttl-toolset', scope: 'ttl_turns', expiresAtTurn: 5 },
    ]);
  });

  test('does not renew TTL for unknown tools or non-TTL toolsets', async () => {
    registerToolset({
      id: 'persisted',
      kind: 'native',
      name: 'Persisted',
      description: 'Persisted',
      tools: () => [{ name: 'persisted_tool', description: 'persisted' }],
      activate: async () => ({ persisted_tool: makeTool('persisted') }),
    } satisfies Toolset);

    const manager = createManager();
    await manager.activate('persisted', { scope: 'until_deactivated' });

    expect(manager.renewTtlForTool('missing_tool', 5)).toBeNull();
    expect(manager.renewTtlForTool('persisted_tool', 5)).toBeNull();
    expect(manager.getPersistableActivationState()).toEqual([{ id: 'persisted', scope: 'until_deactivated' }]);
  });
});

describe('ToolsetManager.advanceTurn and lifecycle', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('increments turnCounter and rolls over current_run activations to expired', async () => {
    registerToolset({
      id: 'run-only',
      kind: 'native',
      name: 'Run Only',
      description: 'Run only',
      tools: () => [{ name: 'run_tool', description: 'run' }],
      activate: async () => ({ run_tool: makeTool('run') }),
    } satisfies Toolset);
    registerToolset({
      id: 'persisted',
      kind: 'native',
      name: 'Persisted',
      description: 'Persisted',
      tools: () => [{ name: 'persisted_tool', description: 'persisted' }],
      activate: async () => ({ persisted_tool: makeTool('persisted') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [],
      { turnCounter: 1 },
    );

    await manager.activate('run-only', { scope: 'current_run' });
    await manager.activate('persisted', { scope: 'until_deactivated' });

    expect(manager.isActive('run-only')).toBe(true);
    expect(manager.isActive('persisted')).toBe(true);
    expect(manager.getTurnCounter()).toBe(1);

    const nextState = manager.advanceTurn({ persist: false });

    expect(manager.getTurnCounter()).toBe(2);
    expect(manager.isActive('run-only')).toBe(false);
    expect(manager.isActive('persisted')).toBe(true);
    expect(nextState.turnCounter).toBe(2);
    expect(nextState.active).toEqual([{ id: 'persisted', scope: 'until_deactivated' }]);
    expect(nextState.expired).toEqual([{ id: 'run-only', expiredAtTurn: 2, toolNames: ['run_tool'] }]);
    expect(manager.getExpiredToolsets()).toEqual([{ id: 'run-only', expiredAtTurn: 2, toolNames: ['run_tool'] }]);
  });

  test('expires TTL toolsets when turn counter passes expiration turn', async () => {
    registerToolset({
      id: 'ttl-ts',
      kind: 'native',
      name: 'TTL Toolset',
      description: 'TTL Toolset',
      tools: () => [{ name: 'ttl_tool', description: 'ttl' }],
      activate: async () => ({ ttl_tool: makeTool('ttl') }),
    } satisfies Toolset);

    const manager = new ToolsetManager(
      { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' },
      [],
      { turnCounter: 1 },
    );

    // Expires at turn 2 (meaning valid on turn 1 and turn 2)
    await manager.activate('ttl-ts', { scope: 'ttl_turns', expiresAtTurn: 2 });

    expect(manager.isActive('ttl-ts')).toBe(true);

    // Advance to turn 2 - still valid because expiresAtTurn (2) >= nextTurnCounter (2)
    manager.advanceTurn({ persist: false });
    expect(manager.getTurnCounter()).toBe(2);
    expect(manager.isActive('ttl-ts')).toBe(true);

    // Advance to turn 3 - should expire because expiresAtTurn (2) < nextTurnCounter (3)
    const state3 = manager.advanceTurn({ persist: false });
    expect(manager.getTurnCounter()).toBe(3);
    expect(manager.isActive('ttl-ts')).toBe(false);
    expect(state3.active).toEqual([]);
    expect(state3.expired).toEqual([{ id: 'ttl-ts', expiredAtTurn: 3, toolNames: ['ttl_tool'] }]);
  });
});

describe('ToolsetManager.forSession hydration and persistence', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('hydrates state from DB, restores tools, and manages turn persistence', async () => {
    const sessionId = 'ses_hydration_test' as never;
    getDb().insert(sessions).values({ id: sessionId, title: 'Hydration test' }).run();

    registerToolset({
      id: 'hydrated-toolset',
      kind: 'native',
      name: 'Hydrated',
      description: 'Hydrated toolset',
      tools: () => [{ name: 'hydrated_tool', description: 'hydrated' }],
      activate: async () => ({ hydrated_tool: makeTool('hydrated') }),
    } satisfies Toolset);

    ToolsetManager.setSessionState(sessionId, {
      turnCounter: 1,
      active: [{ id: 'hydrated-toolset', scope: 'until_deactivated' }],
      expired: [],
    });

    const manager = await ToolsetManager.forSession({
      sessionId,
      messageId: 'msg_test' as never,
      streamRunId: 'run_test',
    });

    expect(manager.getTurnCounter()).toBe(1);
    expect(manager.isActive('hydrated-toolset')).toBe(true);
    expect(manager.getActiveTools()).toHaveProperty('hydrated_tool');

    // Activate a run-only toolset
    registerToolset({
      id: 'dynamic-run',
      kind: 'native',
      name: 'Dynamic Run',
      description: 'Dynamic run',
      tools: () => [{ name: 'dyn_tool', description: 'dyn' }],
      activate: async () => ({ dyn_tool: makeTool('dyn') }),
    } satisfies Toolset);

    await manager.activate('dynamic-run', { scope: 'current_run' });
    expect(manager.isActive('dynamic-run')).toBe(true);

    // Advance turn - should expire dynamic-run and persist state to DB
    manager.advanceTurn();

    const dbState = ToolsetManager.getSessionState(sessionId);
    expect(dbState.turnCounter).toBe(2);
    expect(dbState.active).toEqual([{ id: 'hydrated-toolset', scope: 'until_deactivated' }]);
    expect(dbState.expired).toEqual([{ id: 'dynamic-run', expiredAtTurn: 2, toolNames: ['dyn_tool'] }]);
  });
});
