import { tool } from 'ai';
import { beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { z } from 'zod';

import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import { PATHS } from '@/lib/paths.js';
import { PermissionRejectedError, StreamProtocolViolationError } from '@/llm/stream/errors.js';
import { allowPermissionResponse, alternativePermissionResponse, upsertPerm } from '@/permission/service.js';
import { ToolError } from '@/tools/errors.js';
import {
  bindTool,
  bindTools,
  executeRuntimeTool,
  type ToolContext,
  type ToolDefinition,
} from '@/tools/runtime/runtime.js';

setupTestDb();

const context: ToolContext = {
  sessionId: 'ses_test' as never,
  messageId: 'msg_test' as never,
  streamRunId: 'run_test',
};

beforeEach(() => {
  interactionBroker.clear();
});

describe('tool runtime binding', () => {
  test('bindTool binds single tool execution with context', async () => {
    const def: ToolDefinition = {
      name: 'example',
      displayName: 'Example',
      tool: tool({
        description: 'example tool',
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => ({ echo: value }),
      }),
    };

    const bound = bindTool(context, def);
    expect(bound.description).toBe('example tool');

    const result = await bound.execute?.({ value: 'hello' }, {} as never);
    expect(result).toEqual({ echo: 'hello' });
  });

  test('bindTools binds multiple tool definitions into tool record', async () => {
    const defs: ToolDefinition[] = [
      {
        name: 'tool_a',
        displayName: 'Tool A',
        tool: tool({ description: 'tool a', inputSchema: z.object({}), execute: async () => 'result_a' }),
      },
      {
        name: 'tool_b',
        displayName: 'Tool B',
        tool: tool({ description: 'tool b', inputSchema: z.object({}), execute: async () => 'result_b' }),
      },
    ];

    const tools = bindTools(context, defs);
    expect(Object.keys(tools)).toEqual(['tool_a', 'tool_b']);
    expect(await tools.tool_a.execute?.({}, {} as never)).toBe('result_a');
    expect(await tools.tool_b.execute?.({}, {} as never)).toBe('result_b');
  });

  test('handles tool without execute method gracefully', async () => {
    const def: ToolDefinition = {
      name: 'no_execute',
      displayName: 'No Execute',
      tool: { description: 'manual tool without execute', parameters: z.object({}) } as never,
    };

    const bound = bindTool(context, def);
    expect(bound.execute).toBeUndefined();

    const result = await executeRuntimeTool(def, context, {});
    expect(result).toBeUndefined();
  });
});

describe('runtime permission behavior', () => {
  test('throws PermissionRejectedError when tool permission is denied by rule', async () => {
    await upsertPerm({ toolName: 'denied_tool', permission: 'deny', pattern: null });

    const def: ToolDefinition = {
      name: 'denied_tool',
      displayName: 'Denied Tool',
      permission: { getPatternTargets: () => [], getSuggestion: () => null },
      tool: tool({ description: 'denied tool', inputSchema: z.object({}), execute: async () => 'should not execute' }),
    };

    const bound = bindTool(context, def);
    expect(bound.execute?.({}, {} as never)).rejects.toThrow(PermissionRejectedError);
  });

  test('throws StreamProtocolViolationError when permission prompt lacks toolCallId', async () => {
    await upsertPerm({ toolName: 'prompt_tool_no_id', permission: 'ask', pattern: null });

    const def: ToolDefinition = {
      name: 'prompt_tool_no_id',
      displayName: 'Prompt Tool',
      permission: { getPatternTargets: () => [], getSuggestion: () => null },
      tool: tool({ description: 'prompt tool', inputSchema: z.object({}), execute: async () => 'should not execute' }),
    };

    const bound = bindTool(context, def);
    expect(bound.execute?.({}, {} as never)).rejects.toThrow(StreamProtocolViolationError);
  });

  test('prompts for permission and executes when allowed', async () => {
    await upsertPerm({ toolName: 'prompt_tool_allow', permission: 'ask', pattern: null });

    const requestPromise = new Promise<string>((resolve) => {
      const unsub = internalBus.onSync('permission.requested', (data) => {
        unsub();
        resolve(data.permissionResponse.id);
      });
    });

    const def: ToolDefinition = {
      name: 'prompt_tool_allow',
      displayName: 'Prompt Tool',
      permission: { getPatternTargets: () => [], getSuggestion: () => null },
      tool: tool({ description: 'prompt tool', inputSchema: z.object({}), execute: async () => 'permitted result' }),
    };

    const bound = bindTool(context, def);
    const executionPromise = bound.execute?.({}, { toolCallId: 'tc_123' } as never);

    const requestedId = await requestPromise;
    await allowPermissionResponse(requestedId as never);
    const result = await executionPromise;
    expect(result).toBe('permitted result');
  });

  test('prompts for permission and returns skip result when user chooses alternative', async () => {
    await upsertPerm({ toolName: 'prompt_tool_alt', permission: 'ask', pattern: null });

    const requestPromise = new Promise<string>((resolve) => {
      const unsub = internalBus.onSync('permission.requested', (data) => {
        unsub();
        resolve(data.permissionResponse.id);
      });
    });

    const def: ToolDefinition = {
      name: 'prompt_tool_alt',
      displayName: 'Prompt Tool',
      permission: { getPatternTargets: () => [], getSuggestion: () => null },
      tool: tool({ description: 'prompt tool', inputSchema: z.object({}), execute: async () => 'should not execute' }),
    };

    const bound = bindTool(context, def);
    const executionPromise = bound.execute?.({}, { toolCallId: 'tc_456' } as never);

    const requestedId = await requestPromise;
    await alternativePermissionResponse(requestedId as never, 'Use another approach instead');
    const result = await executionPromise;
    expect(result).toEqual({
      skipped: true,
      reason: 'user_requested_alternative',
      message: 'User requested to do something else: Use another approach instead',
    });
  });
});

describe('runtime result normalization', () => {
  test('throws ToolError when tool returns an error-shaped result', async () => {
    const def: ToolDefinition = {
      name: 'failing_tool',
      displayName: 'Failing Tool',
      tool: tool({
        description: 'failing tool',
        inputSchema: z.object({}),
        execute: async () => ({ error: 'boom', details: { code: 400 } }),
      }),
    };

    const bound = bindTool(context, def);
    expect(bound.execute?.({}, {} as never)).rejects.toThrow(ToolError);
    expect(bound.execute?.({}, {} as never)).rejects.toThrow('boom');
  });

  test('unwraps data result payloads', async () => {
    const def: ToolDefinition = {
      name: 'data_tool',
      displayName: 'Data Tool',
      tool: tool({
        description: 'data tool',
        inputSchema: z.object({}),
        execute: async () => ({ data: { success: true, count: 42 } }),
      }),
    };

    const bound = bindTool(context, def);
    expect(await bound.execute?.({}, {} as never)).toEqual({ success: true, count: 42 });
  });

  test('preserves plain output results', async () => {
    const def: ToolDefinition = {
      name: 'plain_tool',
      displayName: 'Plain Tool',
      tool: tool({
        description: 'plain tool',
        inputSchema: z.object({}),
        execute: async () => ({ output: 'hello world' }),
      }),
    };

    const bound = bindTool(context, def);
    expect(await bound.execute?.({}, {} as never)).toEqual({ output: 'hello world' });
  });

  test('does not treat generic objects containing error field as failures if they have other keys', async () => {
    const def: ToolDefinition = {
      name: 'search_tool',
      displayName: 'Search Tool',
      tool: tool({
        description: 'search tool',
        inputSchema: z.object({}),
        execute: async () => ({ error: 'non-fatal warning', matches: ['a', 'b'], total: 2 }),
      }),
    };

    const bound = bindTool(context, def);
    expect(await bound.execute?.({}, {} as never)).toEqual({
      error: 'non-fatal warning',
      matches: ['a', 'b'],
      total: 2,
    });
  });
});

describe('runtime output truncation', () => {
  test('returns compact result and saves full content to disk when truncation is triggered', async () => {
    const largeOutput = 'big output\n'.repeat(300);
    const def: ToolDefinition = {
      name: 'truncating_tool',
      displayName: 'Truncating Tool',
      truncation: { maxBytes: 120 },
      tool: tool({
        description: 'truncating tool',
        inputSchema: z.object({}),
        execute: async () => ({ output: largeOutput, title: 'kept title', attachment: 'x'.repeat(20_000) }),
      }),
    };

    const bound = bindTool(context, def);
    const result = await bound.execute?.({}, {} as never);

    if (!result || typeof result !== 'object' || !('__stitchToolResultMeta' in result)) {
      throw new Error('expected truncation metadata in bound tool result');
    }

    const typed = result as {
      output: string;
      title: string;
      __stitchToolResultMeta: { truncated: boolean; outputPath: string };
    };
    const outputPath = typed.__stitchToolResultMeta.outputPath;
    const output = typed.output;
    const title = typed.title;

    expect(result).toMatchObject({
      output: expect.stringContaining('truncated'),
      __stitchToolResultMeta: { truncated: true, outputPath: expect.stringContaining(PATHS.dirPaths.toolOutput) },
    });

    await fs.stat(outputPath);
    const savedContent = await fs.readFile(outputPath, 'utf8');

    expect(savedContent).toBe(largeOutput);
    expect(title).toBe('kept title');
    expect(output).toContain('Full raw output saved to:');
    expect(output).toContain('prefer Grep first');
  });

  test('skips truncation when skipTruncation option is true', async () => {
    const largeOutput = 'big output\n'.repeat(300);
    const def: ToolDefinition = {
      name: 'large_tool',
      displayName: 'Large Tool',
      truncation: { maxBytes: 120 },
      tool: tool({
        description: 'large tool',
        inputSchema: z.object({}),
        execute: async () => ({ output: largeOutput }),
      }),
    };

    const bound = bindTool(context, def);
    const result = await bound.execute?.({}, { skipTruncation: true } as never);

    expect(result).toEqual({ output: largeOutput });
  });

  test('returns original result when truncation is not needed', async () => {
    const def: ToolDefinition = {
      name: 'small_tool',
      displayName: 'Small Tool',
      tool: tool({
        description: 'small tool',
        inputSchema: z.object({}),
        execute: async () => ({ output: 'small output' }),
      }),
    };

    const bound = bindTool(context, def);
    const result = await bound.execute?.({}, {} as never);

    expect(result).toEqual({ output: 'small output' });
  });
});
