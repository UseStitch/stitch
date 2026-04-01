import { tool } from 'ai';
import fs from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { PATHS } from '@/lib/paths.js';
import { withTruncation } from '@/tools/runtime/wrappers.js';

describe('withTruncation', () => {
  test('returns compact result when truncation is triggered', async () => {
    const wrapped = withTruncation(
      tool({
        description: 'test tool',
        inputSchema: z.object({}),
        execute: async () => ({
          output: 'big output',
          attachment: 'x'.repeat(20_000),
        }),
      }),
      { maxBytes: 120 },
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
  });

  test('returns original result when truncation is not needed', async () => {
    const wrapped = withTruncation(
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
