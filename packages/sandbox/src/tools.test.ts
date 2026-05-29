import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { createProcessSandbox } from '../src/index.js';

import type { ToolBinding } from '../src/types.js';

const PROCESS_ENTRY = fileURLToPath(new URL('./process-entry.ts', import.meta.url));

function createDriver() {
  return createProcessSandbox({ execPath: PROCESS_ENTRY });
}

const echoBinding: ToolBinding = {
  name: 'external_echo',
  description: 'echo input',
  inputSchema: { type: 'object' },
  execute: async (input) => input,
};

describe('sandbox tools', () => {
  test('propagates tool errors into user code', async () => {
    const context = await createDriver().createContext({
      external_fail: {
        name: 'external_fail',
        description: 'fail',
        inputSchema: { type: 'object' },
        execute: async () => {
          throw new Error('tool failed');
        },
      },
    });

    try {
      const result = await context.execute(`
        try {
          await external_fail({});
        } catch (error) {
          return error.message;
        }
      `);

      expect(result.result).toBe('tool failed');
    } finally {
      context.dispose();
    }
  });

  test('limits tool call count', async () => {
    const context = await createDriver().createContext(
      { external_echo: echoBinding },
      { maxToolCalls: 1 },
    );

    try {
      const result = await context.execute(`
        await external_echo({ value: 1 });
        try {
          await external_echo({ value: 2 });
        } catch (error) {
          return error.message;
        }
      `);

      expect(result.result).toBe('Exceeded maximum tool calls (1)');
    } finally {
      context.dispose();
    }
  });
});
