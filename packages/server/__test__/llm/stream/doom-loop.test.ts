import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  isDoomLoop,
  waitForUserDecision,
  resolveDecision,
  type ToolCallRecord,
} from '@/llm/stream/doom-loop.js';

describe('isDoomLoop', () => {
  test('returns false when history is empty', () => {
    expect(isDoomLoop([])).toBe(false);
  });

  test('returns false when history has fewer than 3 entries', () => {
    const history: ToolCallRecord[] = [
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
    ];
    expect(isDoomLoop(history)).toBe(false);
  });

  test('returns true when last 3 entries are identical', () => {
    const entry: ToolCallRecord = { toolName: 'read', inputJson: '{"path":"a.ts"}' };
    expect(isDoomLoop([entry, entry, entry])).toBe(true);
  });

  test('returns false when tool names differ among last 3', () => {
    const history: ToolCallRecord[] = [
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
      { toolName: 'write', inputJson: '{"path":"a.ts"}' },
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
    ];
    expect(isDoomLoop(history)).toBe(false);
  });

  test('returns false when inputs differ among last 3', () => {
    const history: ToolCallRecord[] = [
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
      { toolName: 'read', inputJson: '{"path":"b.ts"}' },
      { toolName: 'read', inputJson: '{"path":"c.ts"}' },
    ];
    expect(isDoomLoop(history)).toBe(false);
  });

  test('returns true when only the tail matches despite earlier different entries', () => {
    const varied: ToolCallRecord[] = [
      { toolName: 'write', inputJson: '{"content":"hello"}' },
      { toolName: 'read', inputJson: '{"path":"b.ts"}' },
      { toolName: 'exec', inputJson: '{"cmd":"ls"}' },
    ];
    const repeated: ToolCallRecord = { toolName: 'read', inputJson: '{"path":"a.ts"}' };
    expect(isDoomLoop([...varied, repeated, repeated, repeated])).toBe(true);
  });

  test('returns false when only 2 of the last 3 match', () => {
    const history: ToolCallRecord[] = [
      { toolName: 'write', inputJson: '{"content":"x"}' },
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
      { toolName: 'read', inputJson: '{"path":"a.ts"}' },
    ];
    expect(isDoomLoop(history)).toBe(false);
  });
});

describe('waitForUserDecision / resolveDecision', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('resolveDecision returns false when no pending prompt exists', () => {
    expect(resolveDecision('ses_nonexistent', 'continue')).toBe(false);
  });

  test('resolveDecision resolves the pending promise with continue', async () => {
    const promise = waitForUserDecision('ses_1');
    resolveDecision('ses_1', 'continue');
    await expect(promise).resolves.toBe('continue');
  });

  test('resolveDecision resolves the pending promise with stop', async () => {
    const promise = waitForUserDecision('ses_2');
    resolveDecision('ses_2', 'stop');
    await expect(promise).resolves.toBe('stop');
  });

  test('auto-stops after timeout when user does not respond', async () => {
    const promise = waitForUserDecision('ses_3');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(promise).resolves.toBe('stop');
  });

  test('second call for same session cancels the first with stop', async () => {
    const first = waitForUserDecision('ses_4');
    const second = waitForUserDecision('ses_4');

    // First promise should have been resolved with 'stop' by the second call
    await expect(first).resolves.toBe('stop');

    // Second promise is still pending — resolve it normally
    resolveDecision('ses_4', 'continue');
    await expect(second).resolves.toBe('continue');
  });
});
