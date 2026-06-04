import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import ChatMarkdown from './chat-markdown.js';

describe('ChatMarkdown', () => {
  test('renders dollar amounts as text instead of inline math', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown text="* **$10 Billion Private Placement:** Warren agreed to buy $5 billion." />,
    );

    expect(html).toContain('$10 Billion Private Placement:');
    expect(html).toContain('$5 billion');
    expect(html).not.toContain('katex');
  });

  test('still renders double-dollar inline math', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text="Inline math: $$x + y$$" />);

    expect(html).toContain('katex');
  });
});
