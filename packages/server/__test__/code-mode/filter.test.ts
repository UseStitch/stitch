import { beforeEach, describe, expect, test } from 'vitest';

import { applyToolFilter } from '@/code-mode/filter.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

function registerTestToolset(id: string, toolNames: string[]): void {
  const toolset: Toolset = {
    id,
    name: id,
    description: `${id} test toolset`,
    tools: () => toolNames.map((name) => ({ name, description: `${name} test tool` })),
    activate: async () => ({}),
  };

  registerToolset(toolset);
}

function buildTools(toolNames: string[]): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const toolName of toolNames) {
    tools[toolName] = {} as Tool;
  }
  return tools;
}

describe('applyToolFilter', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('excludes tools from excluded toolset IDs', () => {
    registerTestToolset('browser', ['browser']);
    registerTestToolset('mcp:mcp_abcdefghijklmnopqrstuvwxyz', [
      'mcp_abcdefghijklmnopqrstuvwxyz_search',
    ]);

    const input = buildTools(['browser', 'mcp_abcdefghijklmnopqrstuvwxyz_search', 'read']);
    const result = applyToolFilter(input, {
      excludeToolsets: ['mcp:mcp_abcdefghijklmnopqrstuvwxyz'],
    });

    expect(Object.keys(result)).toEqual(['read']);
  });

  test('supports trailing-colon toolset IDs for compatibility', () => {
    registerTestToolset('browser', ['browser']);

    const input = buildTools(['browser', 'glob']);
    const result = applyToolFilter(input, {
      excludeToolsets: ['browser:'],
    });

    expect(Object.keys(result)).toEqual(['glob']);
  });

  test('excludes only named tools for excludeToolsInToolset', () => {
    registerTestToolset('mcp:mcp_abcdefghijklmnopqrstuvwxyz', [
      'mcp_abcdefghijklmnopqrstuvwxyz_search',
      'mcp_abcdefghijklmnopqrstuvwxyz_fetch',
    ]);

    const input = buildTools([
      'mcp_abcdefghijklmnopqrstuvwxyz_search',
      'mcp_abcdefghijklmnopqrstuvwxyz_fetch',
      'read',
    ]);
    const result = applyToolFilter(input, {
      excludeToolsInToolset: {
        'mcp:mcp_abcdefghijklmnopqrstuvwxyz': ['mcp_abcdefghijklmnopqrstuvwxyz_search'],
      },
    });

    expect(Object.keys(result)).toEqual(['mcp_abcdefghijklmnopqrstuvwxyz_fetch', 'read']);
  });
});
