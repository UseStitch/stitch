import { describe, expect, test } from 'bun:test';

import { isHostMessage, isWorkerMessage } from './protocol.js';

describe('sandbox protocol', () => {
  test('accepts valid worker message variants', () => {
    expect(isWorkerMessage({ type: 'tool_call', id: 'call-1', name: 'external_read', args: undefined })).toBe(true);
    expect(isWorkerMessage({ type: 'error', error: 'failed', logs: [] })).toBe(true);
    expect(isWorkerMessage({ type: 'unknown' })).toBe(false);
  });

  test('validates complete worker messages', () => {
    expect(isWorkerMessage({ type: 'complete', result: 42, logs: ['done'] })).toBe(true);
    expect(isWorkerMessage({ type: 'complete' })).toBe(false);
    expect(isWorkerMessage({ type: 'complete', result: 42, logs: [1] })).toBe(false);
  });

  test('validates memory reports', () => {
    expect(isWorkerMessage({ type: 'memory_report', rss: 1024 })).toBe(true);
    expect(isWorkerMessage({ type: 'memory_report', rss: Number.NaN })).toBe(false);
    expect(isWorkerMessage({ type: 'memory_report', rss: -1 })).toBe(false);
  });

  test('validates host initialization messages', () => {
    expect(
      isHostMessage({
        type: 'init',
        toolNames: ['external_read'],
        libraries: { libpdf: { specifier: '@libpdf/core' } },
        memoryReportIntervalMs: 500,
      }),
    ).toBe(true);
    expect(isHostMessage({ type: 'init', toolNames: [1], libraries: {}, memoryReportIntervalMs: 500 })).toBe(false);
    expect(
      isHostMessage({
        type: 'init',
        toolNames: [],
        libraries: { invalid: { specifier: 'pkg', inject: 'yes' } },
        memoryReportIntervalMs: 500,
      }),
    ).toBe(false);
  });

  test('accepts valid host message variants', () => {
    expect(isHostMessage({ type: 'execute', code: 'return true;' })).toBe(true);
    expect(isHostMessage({ type: 'tool_result', id: 'call-1', result: undefined })).toBe(true);
    expect(isHostMessage({ type: 'tool_error', id: 'call-1', error: 'failed' })).toBe(true);
    expect(isHostMessage([])).toBe(false);
  });

  test('rejects host messages with missing required fields', () => {
    expect(isHostMessage({ type: 'execute' })).toBe(false);
    expect(isHostMessage({ type: 'tool_result', id: 'call-1' })).toBe(false);
    expect(isHostMessage({ type: 'tool_error', id: 'call-1', error: 42 })).toBe(false);
  });
});
