import { describe, expect, test } from 'bun:test';

import type { IsolateDriver, IsolateOptions } from '@stitch/sandbox';

import { createCodeModeTool, serializeIsolateOutput } from '@/code-mode/tool.js';

describe('serializeIsolateOutput', () => {
  test('serializes null result as no return value', () => {
    const output = serializeIsolateOutput(null, []);
    expect(output).toContain('=== Result ===');
    expect(output).toContain('(no return value)');
  });

  test('serializes undefined result as no return value', () => {
    const output = serializeIsolateOutput(undefined, []);
    expect(output).toContain('(no return value)');
  });

  test('serializes error-shaped data as successful JSON', () => {
    const output = serializeIsolateOutput({ error: 'something failed' }, []);
    expect(output).toContain('"error": "something failed"');
  });

  test('serializes an object with error data as successful JSON', () => {
    const output = serializeIsolateOutput({ error: { code: 500, msg: 'bad' }, value: 42 }, []);
    expect(output).toContain('"error": {');
    expect(output).toContain('"value": 42');
    expect(output).not.toContain('Error:');
  });

  test('serializes successful object result as JSON', () => {
    const output = serializeIsolateOutput({ count: 3, items: ['a', 'b'] }, []);
    expect(output).toContain('=== Result ===');
    expect(output).toContain('"count": 3');
    expect(output).toContain('"items"');
  });

  test('includes console output when logs are present', () => {
    const logs = ['[log] hello', '[warn] be careful'];
    const output = serializeIsolateOutput('done', logs);
    expect(output).toContain('=== Console Output ===');
    expect(output).toContain('[log] hello');
    expect(output).toContain('[warn] be careful');
  });

  test('omits console section when no logs', () => {
    const output = serializeIsolateOutput('done', []);
    expect(output).not.toContain('=== Console Output ===');
  });

  test('handles unserializable result gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const output = serializeIsolateOutput(circular, []);
    expect(output).toContain('[unserializable result]');
  });
});

describe('createCodeModeTool', () => {
  test('applies resource limits while preserving isolate option overrides', async () => {
    const createdOptions: IsolateOptions[] = [];
    const driver: IsolateDriver = {
      createContext: async (_bindings, options) => {
        createdOptions.push(options ?? {});
        return { execute: async () => ({ ok: true, result: true, logs: [] }), dispose: () => {} };
      },
    };
    const { tool: defaultTool } = createCodeModeTool({ getTools: () => ({}), driver });
    const { tool: overriddenTool } = createCodeModeTool({
      getTools: () => ({}),
      driver,
      isolateOptions: { memoryLimit: 256, timeout: 45_000 },
    });

    await defaultTool.execute?.(
      { code: 'return true;', description: 'run with default limits' },
      { toolCallId: 'call-default-limits', messages: [] },
    );
    await overriddenTool.execute?.(
      { code: 'return true;', description: 'run with custom limits' },
      { toolCallId: 'call-custom-limits', messages: [] },
    );

    expect(createdOptions).toEqual([
      expect.objectContaining({ memoryLimit: 128, timeout: 30_000 }),
      expect.objectContaining({ memoryLimit: 256, timeout: 45_000 }),
    ]);
  });

  test('throws on invalid syntax without creating a sandbox context', () => {
    const driver: IsolateDriver = {
      createContext: () => {
        throw new Error('context should not be created for invalid syntax');
      },
    };

    const { tool: codeModeTool } = createCodeModeTool({ getTools: () => ({}), driver });

    expect(
      codeModeTool.execute?.({ code: 'const = ;', description: 'broken code' }, { toolCallId: 'call-1', messages: [] }),
    ).rejects.toThrow('Syntax error in provided code');
  });

  test('returns sandbox execution errors as canonical tool errors', async () => {
    const driver: IsolateDriver = {
      createContext: async () => ({
        execute: async () => ({ ok: false, error: 'sandbox failed', logs: [] }),
        dispose: () => {},
      }),
    };
    const { tool: codeModeTool } = createCodeModeTool({ getTools: () => ({}), driver });

    const result = await codeModeTool.execute?.(
      { code: 'return true;', description: 'run valid code' },
      { toolCallId: 'call-2', messages: [] },
    );

    expect(result).toEqual({ error: 'sandbox failed' });
  });

  test('preserves sandbox logs in canonical tool error details', async () => {
    const driver: IsolateDriver = {
      createContext: async () => ({
        execute: async () => ({ ok: false, error: 'sandbox failed', logs: ['[log] before failure'] }),
        dispose: () => {},
      }),
    };
    const { tool: codeModeTool } = createCodeModeTool({ getTools: () => ({}), driver });

    const result = await codeModeTool.execute?.(
      { code: 'return true;', description: 'run valid code' },
      { toolCallId: 'call-3', messages: [] },
    );

    expect(result).toEqual({ error: 'sandbox failed', details: { logs: ['[log] before failure'] } });
  });

  test('keeps legitimate error-shaped objects on the success path', async () => {
    const driver: IsolateDriver = {
      createContext: async () => ({
        execute: async () => ({ ok: true, result: { error: 'status text' }, logs: [] }),
        dispose: () => {},
      }),
    };
    const { tool: codeModeTool } = createCodeModeTool({ getTools: () => ({}), driver });

    const result = await codeModeTool.execute?.(
      { code: 'return true;', description: 'run valid code' },
      { toolCallId: 'call-4', messages: [] },
    );

    expect(result).toMatchObject({ output: expect.stringContaining('"error": "status text"'), truncated: false });
  });
});
