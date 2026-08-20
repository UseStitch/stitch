import { tool } from 'ai';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { wrapTool } from '@/tools/runtime/pipeline.js';

const context = { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' };

describe('wrapTool', () => {
  test('wraps and executes tool with metadata and context', async () => {
    let capturedArgs: unknown = null;
    const wrapped = wrapTool(context, {
      name: 'example',
      displayName: 'Example Tool',
      tool: tool({
        description: 'example tool',
        inputSchema: z.object({ value: z.string() }),
        execute: async (args) => {
          capturedArgs = args;
          return { data: { success: true } };
        },
      }),
    });

    const result = await wrapped.execute?.({ value: 'hello' }, {} as never);
    expect(capturedArgs).toEqual({ value: 'hello' });
    expect(result).toEqual({ success: true });
  });

  test('returns tool unmodified if tool has no execute function', () => {
    const rawTool = tool({ description: 'no execute tool', inputSchema: z.object({}) });

    const wrapped = wrapTool(context, { name: 'no_execute', displayName: 'No Execute', tool: rawTool });

    expect(wrapped.execute).toBeUndefined();
  });
});
