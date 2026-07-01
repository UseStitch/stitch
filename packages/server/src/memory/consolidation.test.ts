import { describe, expect, test } from 'bun:test';

import { validateConsolidationActions } from '@/memory/consolidation.js';
import type { SemanticMemory } from '@/memory/types.js';

type TestMemory = Pick<
  SemanticMemory,
  'id' | 'content' | 'category' | 'confidence' | 'source' | 'sourceId' | 'pinned' | 'updatedAt'
>;

function memory(overrides: Partial<TestMemory>): TestMemory {
  return {
    id: 'mem-1',
    content: 'User prefers TypeScript.',
    category: 'preference',
    confidence: 'stated',
    source: 'chat',
    sourceId: 'ses-1',
    pinned: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateConsolidationActions', () => {
  test('rejects deletes for pinned memories', () => {
    const group = [memory({ id: 'pinned', pinned: true }), memory({ id: 'other' })];

    const result = validateConsolidationActions(group, [
      {
        action: 'DELETE',
        memoryId: 'pinned',
        content: null,
        category: null,
        confidence: null,
      },
    ]);

    expect(result.valid).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  test('rejects actions targeting memories outside the candidate group', () => {
    const group = [memory({ id: 'mem-1' }), memory({ id: 'mem-2' })];

    const result = validateConsolidationActions(group, [
      {
        action: 'UPDATE',
        memoryId: 'missing',
        content: 'User strongly prefers TypeScript.',
        category: null,
        confidence: null,
      },
      {
        action: 'DELETE',
        memoryId: 'missing',
        content: null,
        category: null,
        confidence: null,
      },
    ]);

    expect(result.valid).toEqual([]);
    expect(result.skipped).toBe(2);
  });

  test('accepts bounded add update and unpinned delete actions', () => {
    const group = [memory({ id: 'mem-1' }), memory({ id: 'mem-2' })];

    const result = validateConsolidationActions(group, [
      {
        action: 'ADD',
        memoryId: null,
        content: 'User prefers TypeScript for application development.',
        category: 'preference',
        confidence: 'stated',
      },
      {
        action: 'UPDATE',
        memoryId: 'mem-1',
        content: 'User strongly prefers TypeScript.',
        category: null,
        confidence: null,
      },
      {
        action: 'DELETE',
        memoryId: 'mem-2',
        content: null,
        category: null,
        confidence: null,
      },
    ]);

    expect(result.valid).toEqual([
      {
        action: 'ADD',
        content: 'User prefers TypeScript for application development.',
        category: 'preference',
        confidence: 'stated',
      },
      { action: 'UPDATE', memoryId: 'mem-1', content: 'User strongly prefers TypeScript.' },
      { action: 'DELETE', memoryId: 'mem-2' },
    ]);
    expect(result.skipped).toBe(0);
  });
});
