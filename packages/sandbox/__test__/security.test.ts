import { describe, expect, test } from 'bun:test';

import { createWorkerSandbox } from '../src/index.js';

async function run(code: string) {
  const context = await createWorkerSandbox().createContext({}, { timeout: 1_000 });
  try {
    return await context.execute(code);
  } finally {
    context.dispose();
  }
}

describe('sandbox hardening', () => {
  test('does not expose process, Bun, require, or fetch', async () => {
    const result = await run(`
      return {
        process: typeof process,
        Bun: typeof Bun,
        require: typeof require,
        fetch: typeof fetch,
      };
    `);

    expect(result.result).toEqual({
      process: 'undefined',
      Bun: 'undefined',
      require: 'undefined',
      fetch: 'undefined',
    });
  });

  test('does not expose eval or Function', async () => {
    const result = await run('return { eval: typeof eval, Function: typeof Function };');

    expect(result.result).toEqual({ eval: 'undefined', Function: 'undefined' });
  });

  test('blocks constructor escape paths', async () => {
    const result = await run(`
      return {
        objectConstructor: ({}).constructor,
        arrayConstructor: [].constructor,
        functionConstructor: (async () => {}).constructor,
      };
    `);

    expect(result.result).toEqual({});
  });

  test('rejects dynamic imports', async () => {
    const result = await run('return await import("node:fs");');

    expect(result.result).toEqual({ error: 'dynamic import is not available in the sandbox' });
  });

  test('rejects unsafe library names', async () => {
    expect(
      createWorkerSandbox().createContext(
        {},
        {
          libraries: {
            process: { specifier: new URL('./fixtures/sample-library.ts', import.meta.url).href },
          },
        },
      ),
    ).rejects.toThrow('Invalid sandbox library name: process');
  });
});
