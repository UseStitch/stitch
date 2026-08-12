import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { createProcessSandbox } from '../src/index.js';

const PROCESS_ENTRY = fileURLToPath(new URL('./process-entry.ts', import.meta.url));

function createDriver() {
  return createProcessSandbox({ execPath: PROCESS_ENTRY });
}

async function run(code: string) {
  const context = await createDriver().createContext({}, { timeout: 2_000 });
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

    expect(result).toEqual({
      ok: true,
      result: { process: 'undefined', Bun: 'undefined', require: 'undefined', fetch: 'undefined' },
      logs: [],
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

    expect(result).toEqual({
      ok: true,
      result: { eval: 'undefined', Function: 'undefined', globalFunction: 'object', canCallGlobalFunction: false },
      logs: [],
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

    expect(result).toEqual({ ok: true, result: {}, logs: [] });
  });

  test('allows node fs dynamic imports', async () => {
    const result = await run(`
      const fs = await import('node:fs/promises');
      return { readFile: typeof fs.readFile };
    `);

    expect(result).toEqual({ ok: true, result: { readFile: 'function' }, logs: [] });
  });

  test('rejects non-fs dynamic imports', async () => {
    const result = await run('return await import("node:child_process");');

    expect(result).toEqual({
      ok: false,
      error: 'dynamic import is only available for node:fs and node:fs/promises',
      logs: [],
    });
  });

  test('rejects non-literal dynamic imports', async () => {
    const result = await run('const moduleName = "node:fs"; return await import(moduleName);');

    expect(result).toEqual({
      ok: false,
      error: 'dynamic import is only available for node:fs and node:fs/promises',
      logs: [],
    });
  });

  test('rejects unsafe library names', () => {
    expect(
      createDriver().createContext(
        {},
        { libraries: { process: { specifier: new URL('./fixtures/sample-library.ts', import.meta.url).href } } },
      ),
    ).rejects.toThrow('Invalid sandbox library name: process');
  });

  test('rejects unsafe library global names', () => {
    expect(
      createDriver().createContext(
        {},
        {
          libraries: {
            sample: { specifier: new URL('./fixtures/sample-library.ts', import.meta.url).href, globalName: 'process' },
          },
        },
      ),
    ).rejects.toThrow('Invalid sandbox library global name: process');
  });
});
