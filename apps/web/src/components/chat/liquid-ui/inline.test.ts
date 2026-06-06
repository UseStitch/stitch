import { describe, expect, test } from 'bun:test';

import { parseInlineLiquidUiText } from './inline.js';

describe('parseInlineLiquidUiText', () => {
  test('extracts and repairs inline liquid ui blocks', () => {
    const segments = parseInlineLiquidUiText(`Before

<liquid_ui>
{
  "root": "main",
  "nodes": [
    { "id": "main", "component": "Row", "align": "between", "children": ["title"] },
    { "id": "title", "component": "Text", "text": "Recovered", "variant": "heading" }
  ]
}
</liquid_ui>

After`);

    expect(segments).toEqual([
      { type: 'text', text: 'Before\n\n' },
      {
        type: 'liquid-ui',
        spec: {
          root: 'main',
          nodes: [
            {
              id: 'main',
              component: 'Row',
              gap: 'sm',
              align: 'between',
              children: ['title'],
            },
            { id: 'title', component: 'Text', text: 'Recovered', variant: 'heading' },
          ],
        },
      },
      { type: 'text', text: '\n\nAfter' },
    ]);
  });

  test('returns null when there is no inline block', () => {
    expect(parseInlineLiquidUiText('Plain text only')).toBeNull();
  });

  test('returns null when inline JSON cannot be parsed', () => {
    expect(parseInlineLiquidUiText('<liquid_ui>{ bad json }</liquid_ui>')).toBeNull();
  });
});
