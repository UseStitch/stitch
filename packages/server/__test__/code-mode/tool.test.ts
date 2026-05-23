import { describe, expect, test } from 'vitest';

import { isErrorResult, serializeIsolateOutput } from '@/code-mode/tool.js';

describe('isErrorResult', () => {
  test('returns true for objects with error property', () => {
    expect(isErrorResult({ error: 'something went wrong' })).toBe(true);
    expect(isErrorResult({ error: null })).toBe(true);
    expect(isErrorResult({ error: { code: 500 } })).toBe(true);
  });

  test('returns false for non-error objects', () => {
    expect(isErrorResult({ value: 42 })).toBe(false);
    expect(isErrorResult({})).toBe(false);
    expect(isErrorResult(null)).toBe(false);
    expect(isErrorResult(undefined)).toBe(false);
    expect(isErrorResult('string')).toBe(false);
    expect(isErrorResult(42)).toBe(false);
  });
});

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

  test('serializes error result with string error', () => {
    const output = serializeIsolateOutput({ error: 'something failed' }, []);
    expect(output).toContain('Error: something failed');
  });

  test('serializes error result with object error', () => {
    const output = serializeIsolateOutput({ error: { code: 500, msg: 'bad' } }, []);
    expect(output).toContain('Error: {"code":500,"msg":"bad"}');
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

  test('serializes string result as JSON', () => {
    const output = serializeIsolateOutput('hello world', []);
    expect(output).toContain('"hello world"');
  });

  test('serializes number result', () => {
    const output = serializeIsolateOutput(42, []);
    expect(output).toContain('42');
  });
});
