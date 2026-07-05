import { beforeEach, describe, expect, test } from 'bun:test';

import { listKnownTools } from '@/tools/catalog.js';
import { STITCH_KNOWN_TOOLS } from '@/tools/runtime/registry.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

function makeToolset(overrides: Partial<Toolset>): Toolset {
  return {
    id: 'test',
    kind: 'native',
    name: 'Test',
    description: 'Test toolset',
    tools: () => [],
    activate: async () => ({}),
    ...overrides,
  };
}

describe('listKnownTools', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('returns built-in stitch tools', () => {
    const tools = listKnownTools();
    const stitchTools = tools.filter((t) => t.toolType === 'stitch');
    expect(stitchTools.length).toBe(STITCH_KNOWN_TOOLS.length);
    expect(stitchTools.map((t) => t.toolName)).toEqual(STITCH_KNOWN_TOOLS.map((t) => t.toolName));
  });

  test('includes tools from a registered native toolset', () => {
    registerToolset(
      makeToolset({
        id: 'browser',
        kind: 'native',
        name: 'Browser',
        description: 'Browser toolset',
        tools: () => [
          { name: 'browser_navigate', description: 'Navigate to a URL' },
          { name: 'browser_screenshot', description: 'Take a screenshot' },
        ],
      }),
    );

    const tools = listKnownTools();
    const browserTools = tools.filter((t) => t.toolName.startsWith('browser_'));
    expect(browserTools.length).toBe(2);
    expect(browserTools.map((t) => t.toolType)).toEqual(['plugin', 'plugin']);
    expect(browserTools.map((t) => t.toolName)).toEqual(['browser_navigate', 'browser_screenshot']);
  });

  test('includes tools from a connector toolset', () => {
    registerToolset(
      makeToolset({
        id: 'connector:google:gmail',
        kind: 'connector',
        name: 'Gmail',
        description: 'Gmail connector',
        tools: () => [{ name: 'gmail_send_message', description: 'Send an email' }],
      }),
    );

    const tools = listKnownTools();
    const connectorTool = tools.find((t) => t.toolName === 'gmail_send_message');
    expect(connectorTool).toBeDefined();
    expect(connectorTool?.toolType).toBe('plugin');
    expect(connectorTool?.displayName).toBe('Gmail Send Message');
  });

  test('includes tools from an MCP toolset with formatted names', () => {
    const serverId = 'mcp_abcdefghijklmnopqrstuvwxyz';
    const formattedName = `${serverId}_list_files`;

    registerToolset(
      makeToolset({
        id: `mcp:${serverId}`,
        kind: 'mcp',
        name: 'My MCP Server',
        description: 'MCP server',
        tools: () => [{ name: formattedName, description: 'List files' }],
      }),
    );

    const tools = listKnownTools();
    const mcpTool = tools.find((t) => t.toolName === formattedName);
    expect(mcpTool).toBeDefined();
    expect(mcpTool?.toolType).toBe('mcp');
  });

  test('uses MCP presentation title when available', () => {
    const serverId = 'mcp_abcdefghijklmnopqrstuvwxyz';
    const rawToolName = 'send_email';
    const formattedName = `${serverId}_${rawToolName}`;

    registerToolset(
      makeToolset({
        id: `mcp:${serverId}`,
        kind: 'mcp',
        name: 'Mail Server',
        description: 'Mail MCP server',
        tools: () => [{ name: formattedName, description: 'Send an email' }],
        presentation: { serverId, name: 'Mail Server', tools: { [rawToolName]: { title: 'Send Email Message' } } },
      }),
    );

    const tools = listKnownTools();
    const mcpTool = tools.find((t) => t.toolName === formattedName);
    expect(mcpTool?.displayName).toBe('Send Email Message');
  });

  test('falls back to humanized name for MCP tool without presentation title', () => {
    const serverId = 'mcp_abcdefghijklmnopqrstuvwxyz';
    const rawToolName = 'list_files';
    const formattedName = `${serverId}_${rawToolName}`;

    registerToolset(
      makeToolset({
        id: `mcp:${serverId}`,
        kind: 'mcp',
        name: 'FS Server',
        description: 'FS MCP server',
        tools: () => [{ name: formattedName, description: 'List files' }],
      }),
    );

    const tools = listKnownTools();
    const mcpTool = tools.find((t) => t.toolName === formattedName);
    expect(mcpTool?.displayName).toBe('List Files');
  });

  test('returns only built-in tools when no toolsets are registered', () => {
    const tools = listKnownTools();
    expect(tools.length).toBe(STITCH_KNOWN_TOOLS.length);
    expect(tools.every((t) => t.toolType === 'stitch')).toBe(true);
  });

  test('connector toolset unregistered after being registered', () => {
    registerToolset(
      makeToolset({
        id: 'connector:google:calendar',
        kind: 'connector',
        name: 'Calendar',
        description: 'Calendar connector',
        tools: () => [{ name: 'calendar_create_event', description: 'Create a calendar event' }],
      }),
    );

    unregisterToolset('connector:google:calendar');

    const tools = listKnownTools();
    const calendarTool = tools.find((t) => t.toolName === 'calendar_create_event');
    expect(calendarTool).toBeUndefined();
  });
});
