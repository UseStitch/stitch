import { describe, expect, test, vi } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';

import { withTruncation } from '@/tools/runtime/wrappers.js';

const mocks = vi.hoisted(() => ({
  truncateOutput: vi.fn(),
}));

vi.mock('@/tools/runtime/truncation.js', () => ({
  truncateOutput: mocks.truncateOutput,
}));

describe('withTruncation', () => {
  test('returns compact result when truncation is triggered', async () => {
    mocks.truncateOutput.mockResolvedValue({
      truncated: true,
      content: 'preview',
      outputPath: '/tmp/tool-output',
    });

    const wrapped = withTruncation(
      tool({
        description: 'test tool',
        inputSchema: z.object({}),
        execute: async () => ({
          output: 'big output',
          attachment: 'x'.repeat(20_000),
        }),
      }),
    );

    const result = await wrapped.execute?.({}, {} as never);

    expect(result).toEqual({
      output: 'preview',
      __stitchToolResultMeta: {
        truncated: true,
        outputPath: '/tmp/tool-output',
      },
    });
  });

  test('returns original result when truncation is not needed', async () => {
    mocks.truncateOutput.mockResolvedValue({
      truncated: false,
      content: 'small output',
    });

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
