import { describe, expect, test } from 'bun:test';

import { liquidUiSpecSchema } from './schema';

const validSpec = {
  root: 'n1',
  nodes: [
    { id: 'n1', component: 'Stack', spacing: 'md', children: ['n2', 'n3'] },
    { id: 'n2', component: 'Stat', label: 'Revenue', value: '$4.2k', caption: null, trend: 'up' },
    { id: 'n3', component: 'Badge', variant: 'success', text: 'On track' },
  ],
};

describe('liquidUiSpecSchema', () => {
  test('accepts a valid flat component graph', () => {
    expect(liquidUiSpecSchema.safeParse(validSpec).success).toBe(true);
  });

  test('rejects unknown props', () => {
    const result = liquidUiSpecSchema.safeParse({
      root: 'n1',
      nodes: [{ id: 'n1', component: 'Badge', variant: 'success', text: 'Ok', extra: true }],
    });

    expect(result.success).toBe(false);
  });

  test('rejects dangling child refs', () => {
    const result = liquidUiSpecSchema.safeParse({
      root: 'n1',
      nodes: [{ id: 'n1', component: 'Stack', spacing: 'md', children: ['missing'] }],
    });

    expect(result.success).toBe(false);
  });

  test('rejects cycles', () => {
    const result = liquidUiSpecSchema.safeParse({
      root: 'n1',
      nodes: [
        { id: 'n1', component: 'Stack', spacing: 'md', children: ['n2'] },
        { id: 'n2', component: 'Stack', spacing: 'md', children: ['n1'] },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects orphaned nodes', () => {
    const result = liquidUiSpecSchema.safeParse({
      root: 'n1',
      nodes: [
        { id: 'n1', component: 'Badge', variant: 'info', text: 'Root' },
        { id: 'n2', component: 'Badge', variant: 'warning', text: 'Orphan' },
      ],
    });

    expect(result.success).toBe(false);
  });
});
