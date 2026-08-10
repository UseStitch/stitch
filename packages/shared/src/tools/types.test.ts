import { describe, expect, test } from 'bun:test';

import { getToolFailureMessage } from './types.js';

describe('getToolFailureMessage', () => {
  test('returns the message from a canonical error result', () => {
    expect(getToolFailureMessage({ error: 'boom' })).toBe('boom');
    expect(getToolFailureMessage({ error: 'boom', details: { code: 'x' } })).toBe('boom');
  });

  test('reports a failure for the failed flag, which carries no error message', () => {
    expect(getToolFailureMessage({ failed: true, output: 'exit 1', title: 'ls' })).toBe('Tool execution failed');
  });

  test('returns null for successful results', () => {
    expect(getToolFailureMessage({ output: 'hello' })).toBeNull();
    expect(getToolFailureMessage({ failed: false, output: 'ok' })).toBeNull();
    expect(getToolFailureMessage({})).toBeNull();
  });

  test('returns null for non-object outputs', () => {
    expect(getToolFailureMessage(undefined)).toBeNull();
    expect(getToolFailureMessage(null)).toBeNull();
    expect(getToolFailureMessage('some text output')).toBeNull();
  });

  test('does not report a failure for data results that merely contain an error field', () => {
    expect(getToolFailureMessage({ error: 'non-fatal', matches: [], total: 0 })).toBeNull();
  });

  test('does not report a failure for an empty error message', () => {
    expect(getToolFailureMessage({ error: '' })).toBeNull();
  });
});
