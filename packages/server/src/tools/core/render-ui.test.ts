import { describe, expect, test } from 'bun:test';

import { liquidUiSpecSchema } from '@stitch/shared/liquid-ui/schema';

import { definition } from './render-ui';

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
    const result = await definition.tool.execute?.(validSpec as never, {} as never);

    expect(result).toEqual({ output: 'Rendered render_ui.', spec: validSpec });
  });
});
