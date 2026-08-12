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
  validateInput: () => {},
  execute: async (input) => input,
};

describe('sandbox tools', () => {
  test('propagates tool errors into user code', async () => {
    const context = await createDriver().createContext({
      external_fail: {
        name: 'external_fail',
        description: 'fail',
        inputSchema: { type: 'object' },
        validateInput: () => {},
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

      expect(result).toEqual({ ok: true, result: 'tool failed', logs: [] });
    } finally {
      context.dispose();
    }
  });

  test('validates tool input before execution', async () => {
    let executed = false;
    const context = await createDriver().createContext({
      external_validate: {
        name: 'external_validate',
        description: 'validate input',
        inputSchema: { type: 'object' },
        validateInput: (input) => {
          if (typeof input !== 'object' || input === null || !('value' in input)) {
            throw new Error('value is required');
          }
        },
        execute: async () => {
          executed = true;
          return true;
        },
      },
    });

    try {
      const result = await context.execute(`
        try {
          await external_validate({});
        } catch (error) {
          return error.message;
        }
      `);

      expect(result).toEqual({ ok: true, result: 'value is required', logs: [] });
      expect(executed).toBe(false);
    } finally {
      context.dispose();
    }
  });

  test('limits tool call count', async () => {
    const context = await createDriver().createContext({ external_echo: echoBinding }, { maxToolCalls: 1 });

    try {
      const result = await context.execute(`
        await external_echo({ value: 1 });
        try {
          await external_echo({ value: 2 });
        } catch (error) {
          return error.message;
        }
      `);

      expect(result).toEqual({ ok: true, result: 'Exceeded maximum tool calls (1)', logs: [] });
    } finally {
      context.dispose();
    }
  });
});
