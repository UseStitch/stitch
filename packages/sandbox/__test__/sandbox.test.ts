import { describe, expect, test } from 'bun:test';

import { createWorkerSandbox } from '../src/index.js';
import type { ToolBinding } from '../src/types.js';

async function execute(code: string, bindings: Record<string, ToolBinding> = {}) {
  const context = await createWorkerSandbox().createContext(bindings, { timeout: 2_000 });
  try {
    return await context.execute(code);
  } finally {
    context.dispose();
  }
}

describe('worker sandbox', () => {
  test('executes code and returns the result', async () => {
    const result = await execute('return [1, 2, 3].map((value) => value * 2);');

    expect(result.result).toEqual([2, 4, 6]);
    expect(result.logs).toEqual([]);
  });

  test('captures console output', async () => {
    const result = await execute('console.log("hello", { value: 42 }); return true;');

    expect(result.result).toBe(true);
    expect(result.logs).toEqual(['[log] hello {"value":42}']);
  });

  test('returns runtime errors as result errors', async () => {
    const result = await execute('throw new Error("boom");');

    expect(result.result).toEqual({ error: 'boom' });
  });

  test('calls host tool bindings', async () => {
    const bindings: Record<string, ToolBinding> = {
      external_sum: {
        name: 'external_sum',
        description: 'sum values',
        inputSchema: { type: 'object' },
        execute: async (input) => {
          const { values } = input as { values: number[] };
          return values.reduce((total, value) => total + value, 0);
        },
      },
    };

    const result = await execute('return await external_sum({ values: [1, 2, 3] });', bindings);

    expect(result.result).toBe(6);
  });

  test('terminates infinite loops', async () => {
    const context = await createWorkerSandbox().createContext({}, { timeout: 100 });
    try {
      const result = await context.execute('while (true) {}');
      expect(result.result).toEqual({ error: 'Execution timed out after 100ms' });
    } finally {
      context.dispose();
    }
  });
});
