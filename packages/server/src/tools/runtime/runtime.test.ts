import { tool } from 'ai';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { createToolRuntime } from '@/tools/runtime/runtime.js';
import type { ToolMiddleware } from '@/tools/runtime/runtime.js';

const context = { sessionId: 'ses_test' as never, messageId: 'msg_test' as never, streamRunId: 'run_test' };

describe('tool runtime', () => {
  test('executes middleware in declaration order', async () => {
    const events: string[] = [];
    const middleware =
      (name: string): ToolMiddleware =>
      (next) =>
      async (input) => {
        events.push(`${name}:before`);
        const result = await next(input);
        events.push(`${name}:after`);
        return result;
      };

    const wrapped = createToolRuntime(context)
      .use(middleware('a'))
      .use(middleware('b'))
      .wrapTool(
        'example',
        tool({
          description: 'example tool',
          inputSchema: z.object({}),
          execute: async () => {
            events.push('execute');
            return { ok: true };
          },
        }),
      );

    expect(wrapped.execute?.({}, {} as never)).resolves.toEqual({ ok: true });
    expect(events).toEqual(['a:before', 'b:before', 'execute', 'b:after', 'a:after']);
  });
});
