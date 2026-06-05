import { describe, expect, test } from 'bun:test';

import { liquidUiSpecSchema } from '@stitch/shared/liquid-ui/schema';

import { createRegisteredTool } from './render-ui';

const context = {
  sessionId: 'ses_abcdefghijklmnopqrstuvwxyz' as const,
  messageId: 'msg_abcdefghijklmnopqrstuvwxyz' as const,
  streamRunId: 'run_test',
};

const validSpec = liquidUiSpecSchema.parse({
  root: 'n1',
  nodes: [
    { id: 'n1', component: 'Stack', spacing: 'md', children: ['n2', 'n3'] },
    { id: 'n2', component: 'Stat', label: 'Revenue', value: '$4.2k', caption: null, trend: 'up' },
    { id: 'n3', component: 'Badge', variant: 'success', text: 'On track' },
  ],
});

describe('render_ui tool', () => {
  test('returns the provided spec', async () => {
    const registeredTool = createRegisteredTool(context);

    const result = await registeredTool.execute?.(validSpec as never, {} as never);

    expect(result).toEqual({ output: 'Rendered render_ui.', spec: validSpec });
  });

  test('rejects invalid props through the input schema', () => {
    const result = liquidUiSpecSchema.safeParse({
      root: 'n1',
      nodes: [{ id: 'n1', component: 'Badge', variant: 'success', text: 'Ok', extra: true }],
    });

    expect(result.success).toBe(false);
  });

  test('rejects dangling refs and cycles', () => {
    expect(
      liquidUiSpecSchema.safeParse({
        root: 'n1',
        nodes: [{ id: 'n1', component: 'Stack', spacing: 'md', children: ['missing'] }],
      }).success,
    ).toBe(false);

    expect(
      liquidUiSpecSchema.safeParse({
        root: 'n1',
        nodes: [
          { id: 'n1', component: 'Stack', spacing: 'md', children: ['n2'] },
          { id: 'n2', component: 'Stack', spacing: 'md', children: ['n1'] },
        ],
      }).success,
    ).toBe(false);
  });

  test('accepts deep visual trees as flat nodes', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => {
      const id = `n${index + 1}`;
      const childId = index < 11 ? `n${index + 2}` : null;
      return childId
        ? { id, component: 'Stack', spacing: 'sm', children: [childId] }
        : { id, component: 'Text', text: 'Leaf', variant: 'body' };
    });

    expect(liquidUiSpecSchema.safeParse({ root: 'n1', nodes }).success).toBe(true);
  });
});
