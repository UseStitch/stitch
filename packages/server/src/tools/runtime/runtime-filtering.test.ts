import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ToolEnabledScope } from '@stitch/shared/tools/types';

const mockIsToolEnabled = mock<
  (opts: { scope: ToolEnabledScope; identifier: string }) => Promise<boolean>
>(async () => true);
const mockGetDisabledToolIdentifiers = mock<(scope: ToolEnabledScope) => Promise<Set<string>>>(
  async () => new Set<string>(),
);

mock.module('@/db/client.js', () => ({
  isDbInitialized: () => false,
}));

mock.module('@/tools/enabled-service.js', () => ({
  isToolEnabled: (opts: { scope: ToolEnabledScope; identifier: string }) => mockIsToolEnabled(opts),
  getDisabledToolIdentifiers: (scope: ToolEnabledScope) => mockGetDisabledToolIdentifiers(scope),
}));

import type { Tool } from 'ai';

import { createTools } from '@/tools/runtime/registry.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

function makeTool(description: string): Tool {
  return { description, parameters: { type: 'object', properties: {} } } as unknown as Tool;
}

describe('runtime tool filtering', () => {
  beforeEach(() => {
    clearToolsets();
    mockIsToolEnabled.mockReset();
    mockGetDisabledToolIdentifiers.mockReset();
    mockIsToolEnabled.mockResolvedValue(true);
    mockGetDisabledToolIdentifiers.mockResolvedValue(new Set<string>());
  });

  test('filters disabled core tools when building runtime tool map', async () => {
    mockGetDisabledToolIdentifiers.mockImplementation(async (scope: ToolEnabledScope) =>
      scope === 'tool' ? new Set(['bash']) : new Set<string>(),
    );

    const tools = await createTools({
      sessionId: 'ses_test' as never,
      messageId: 'msg_test' as never,
      streamRunId: 'run_test',
    });

    expect(Object.keys(tools)).not.toContain('bash');
    expect(Object.keys(tools)).toContain('read');
  });

  test('blocks activation for disabled toolsets', async () => {
    registerToolset({
      id: 'toolset-disabled',
      name: 'Disabled Toolset',
      description: 'Should not activate',
      tools: () => [{ name: 'disabled_tool', description: 'disabled' }],
      activate: async () => ({ disabled_tool: makeTool('disabled') }),
    } satisfies Toolset);

    mockIsToolEnabled.mockResolvedValue(false);

    const manager = new ToolsetManager({
      sessionId: 'ses_test' as never,
      messageId: 'msg_test' as never,
      streamRunId: 'run_test',
    });

    const result = await manager.activate('toolset-disabled');

    expect(result.status).toBe('disabled');
    expect(manager.getActiveTools()).toEqual({});
  });

  test('filters disabled mcp tools when activating mcp toolsets', async () => {
    registerToolset({
      id: 'mcp:test-server',
      name: 'Test MCP',
      description: 'MCP test toolset',
      tools: () => [
        { name: 'mcp_alpha', description: 'alpha' },
        { name: 'mcp_beta', description: 'beta' },
      ],
      activate: async () => ({
        mcp_alpha: makeTool('alpha'),
        mcp_beta: makeTool('beta'),
      }),
    } satisfies Toolset);

    mockGetDisabledToolIdentifiers.mockImplementation(async (scope: ToolEnabledScope) =>
      scope === 'mcp_tool' ? new Set(['mcp_alpha']) : new Set<string>(),
    );

    const manager = new ToolsetManager({
      sessionId: 'ses_test' as never,
      messageId: 'msg_test' as never,
      streamRunId: 'run_test',
    });

    const result = await manager.activate('mcp:test-server');
    const activeTools = manager.getActiveTools();

    expect(result.status).toBe('activated');
    expect(result.status === 'activated' && result.toolNames).toEqual(['mcp_beta']);
    expect(Object.keys(activeTools)).toEqual(['mcp_beta']);
  });
});
