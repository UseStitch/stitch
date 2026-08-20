import { beforeEach, describe, expect, test } from 'bun:test';

import { applyToolFilter } from '@/code-mode/filter.js';
import { listToolsets, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset, ToolsetKind } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

function clearToolsets(): void {
  for (const toolset of listToolsets()) {
    unregisterToolset(toolset.id);
  }
}

function registerTestToolset(id: string, toolNames: string[], kind: ToolsetKind = 'native'): void {
  const toolset: Toolset = {
    id,
    kind,
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

  test('excludes tools from always excluded toolsets', () => {
    registerTestToolset('browser', ['browser_open']);
    registerTestToolset('agenda', ['agenda_list']);
    registerTestToolset('custom', ['custom_action']);

    const input = buildTools(['browser_open', 'agenda_list', 'custom_action', 'read']);
    const result = applyToolFilter(input);

    expect(Object.keys(result)).toEqual(['custom_action', 'read']);
  });

  test('always excludes tools without a code-mode surface', () => {
    const input = buildTools(['render_ui', 'question', 'read']);
    const result = applyToolFilter(input);

    expect(Object.keys(result)).toEqual(['read']);
  });
});
