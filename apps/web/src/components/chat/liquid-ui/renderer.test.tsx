import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LiquidUi } from './renderer.js';

describe('LiquidUi', () => {
  test('renders catalog components', () => {
    const html = renderToStaticMarkup(
      <LiquidUi
        spec={{
          root: 'n1',
          nodes: [
            {
              id: 'n1',
              component: 'Card',
              title: 'Summary',
              description: null,
              children: ['n2', 'n3'],
            },
            {
              id: 'n2',
              component: 'Stat',
              label: 'Revenue',
              value: '$4.2k',
              caption: null,
              trend: 'up',
            },
            { id: 'n3', component: 'Badge', variant: 'success', text: 'On track' },
          ],
        }}
      />,
    );

    expect(html).toContain('Summary');
    expect(html).toContain('Revenue');
    expect(html).toContain('On track');
  });

  test('drops unknown child components without crashing', () => {
    const html = renderToStaticMarkup(
      <LiquidUi
        spec={{
          root: 'n1',
          nodes: [
            { id: 'n1', component: 'Stack', spacing: 'md', children: ['n2', 'bad'] },
            { id: 'n2', component: 'Text', text: 'Valid', variant: 'body' },
            { id: 'bad', component: 'Unknown', text: 'Invalid' },
          ],
        }}
      />,
    );

    expect(html).toContain('Valid');
    expect(html).not.toContain('Invalid');
  });

  test('renders skeletons for unresolved streaming child refs', () => {
    const html = renderToStaticMarkup(
      <LiquidUi
        spec={{
          root: 'n1',
          nodes: [{ id: 'n1', component: 'Stack', spacing: 'md', children: ['pending'] }],
        }}
      />,
    );

    expect(html).toContain('animate-pulse');
  });

  test('renders nothing for a totally invalid spec', () => {
    const html = renderToStaticMarkup(<LiquidUi spec={{ bad: true }} />);
    expect(html).toBe('');
  });

  test('renders nothing for null spec', () => {
    const html = renderToStaticMarkup(<LiquidUi spec={null} />);
    expect(html).toBe('');
  });

  test('renders nothing when nodes use nested props shape (model error)', () => {
    const html = renderToStaticMarkup(
      <LiquidUi
        spec={{
          root: 'n1',
          nodes: [{ id: 'n1', component: 'Stack', props: { spacing: 'md' }, children: [] }],
        }}
      />,
    );
    expect(html).toBe('');
  });
});
