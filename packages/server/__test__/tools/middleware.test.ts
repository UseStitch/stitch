import { tool } from 'ai';
import fs from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { PATHS } from '@/lib/paths.js';
import { resultNormalizationMiddleware, truncationMiddleware } from '@/tools/runtime/middleware.js';
import { createToolRuntime } from '@/tools/runtime/runtime.js';

const context = {
  sessionId: 'ses_test' as never,
  messageId: 'msg_test' as never,
  streamRunId: 'run_test',
};

describe('truncationMiddleware', () => {
  test('returns compact result when truncation is triggered', async () => {
    const largeOutput = 'big output\n'.repeat(300);
    const wrapped = createToolRuntime(context)
      .use(truncationMiddleware({ maxBytes: 120 }))
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({
            output: largeOutput,
            title: 'kept title',
            attachment: 'x'.repeat(20_000),
          }),
        }),
      );

    const result = await wrapped.execute?.({}, {} as never);
    expect(result).toMatchObject({
      output: expect.stringContaining('truncated'),
      __stitchToolResultMeta: {
        truncated: true,
        outputPath: expect.stringContaining(PATHS.dirPaths.toolOutput),
      },
    });

    if (!result || typeof result !== 'object' || !('__stitchToolResultMeta' in result)) {
      throw new Error('expected truncation metadata in wrapped tool result');
    }
    const outputPath = (result as { __stitchToolResultMeta: { outputPath: string } })
      .__stitchToolResultMeta.outputPath;
    await expect(fs.stat(outputPath)).resolves.toBeDefined();
    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(largeOutput);
    expect(result).toMatchObject({ title: 'kept title' });
    expect((result as { output: string }).output).toContain('Full raw output saved to:');
    expect((result as { output: string }).output).toContain('prefer Grep first');
  });

  test('returns original result when truncation is not needed', async () => {
    const wrapped = createToolRuntime(context)
      .use(truncationMiddleware())
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({ output: 'small output' }),
        }),
      );

    const result = await wrapped.execute?.({}, {} as never);

    expect(result).toEqual({ output: 'small output' });
  });
});

describe('resultNormalizationMiddleware', () => {
  test('throws when tool returns an error-shaped result', async () => {
    const wrapped = createToolRuntime(context)
      .use(resultNormalizationMiddleware())
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({ error: 'boom' }),
        }),
      );

    await expect(wrapped.execute?.({}, {} as never)).rejects.toThrow('boom');
  });

  test('unwraps data result payloads', async () => {
    const wrapped = createToolRuntime(context)
      .use(resultNormalizationMiddleware())
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({ data: { ok: true } }),
        }),
      );

    await expect(wrapped.execute?.({}, {} as never)).resolves.toEqual({ ok: true });
  });

  test('preserves plain legacy results', async () => {
    const wrapped = createToolRuntime(context)
      .use(resultNormalizationMiddleware())
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({ output: 'hello' }),
        }),
      );

    await expect(wrapped.execute?.({}, {} as never)).resolves.toEqual({ output: 'hello' });
  });

  test('does not treat generic objects containing error as tool failures', async () => {
    const wrapped = createToolRuntime(context)
      .use(resultNormalizationMiddleware())
      .wrapTool(
        'test',
        tool({
          description: 'test tool',
          inputSchema: z.object({}),
          execute: async () => ({ error: 'non-fatal', matches: [], total: 0 }),
        }),
      );

    await expect(wrapped.execute?.({}, {} as never)).resolves.toEqual({
      error: 'non-fatal',
      matches: [],
      total: 0,
    });
  });
});
