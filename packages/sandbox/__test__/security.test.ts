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

  test('does not expose callable eval or Function', async () => {
    const result = await run(`
      return {
        eval: typeof eval,
        Function: typeof Function,
        globalFunction: typeof globalThis.Function,
        canCallGlobalFunction: typeof globalThis.Function === 'function',
      };
    `);

    expect(result.result).toEqual({
      eval: 'undefined',
      Function: 'undefined',
      globalFunction: 'object',
      canCallGlobalFunction: false,
    });
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

  test('allows node fs dynamic imports', async () => {
    const result = await run(`
      const fs = await import('node:fs/promises');
      return { readFile: typeof fs.readFile };
    `);

    expect(result.result).toEqual({ readFile: 'function' });
  });

  test('rejects non-fs dynamic imports', async () => {
    const result = await run('return await import("node:child_process");');

    expect(result.result).toEqual({
      error: 'dynamic import is only available for node:fs and node:fs/promises',
    });
  });

  test('rejects non-literal dynamic imports', async () => {
    const result = await run('const moduleName = "node:fs"; return await import(moduleName);');

    expect(result.result).toEqual({
      error: 'dynamic import is only available for node:fs and node:fs/promises',
    });
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

  test('rejects unsafe library global names', async () => {
    expect(
      createWorkerSandbox().createContext(
        {},
        {
          libraries: {
            sample: {
              specifier: new URL('./fixtures/sample-library.ts', import.meta.url).href,
              globalName: 'process',
            },
          },
        },
      ),
    ).rejects.toThrow('Invalid sandbox library global name: process');
  });
});
