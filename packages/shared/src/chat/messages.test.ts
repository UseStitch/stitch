import { describe, expect, test } from 'bun:test';

import { extractTextFromParts, type StoredPart } from './messages.js';

describe('extractTextFromParts', () => {
  test('joins text parts and ignores other parts', () => {
    const parts: StoredPart[] = [
      { type: 'text-delta', id: 'prt_first', text: 'Hello', startedAt: 1, endedAt: 1 },
      { type: 'reasoning-delta', id: 'prt_reasoning', text: 'hidden', startedAt: 1, endedAt: 1 },
      { type: 'text-delta', id: 'prt_second', text: ' world', startedAt: 1, endedAt: 1 },
    ];

    expect(extractTextFromParts(parts)).toBe('Hello world');
    expect(extractTextFromParts(undefined)).toBe('');
  });
});
