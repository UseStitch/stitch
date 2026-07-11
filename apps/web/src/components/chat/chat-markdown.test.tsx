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

  test('renders single-dollar LaTeX command spans', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Standard AI Routing Proxy $\\rightarrow$ NO-GO.'} />);

    expect(html).toContain('katex');
    expect(html).not.toContain('$\\rightarrow$');
  });

  test('renders arrow command text while streaming', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown text={'Standard AI Routing Proxy $\\rightarrow$ NO-GO.'} isStreaming />,
    );

    expect(html).toContain('→');
    expect(html).not.toContain('$\\rightarrow$');
    expect(html).not.toContain('katex');
  });

  test('renders double-escaped single-dollar LaTeX command spans', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Standard AI Routing Proxy $\\\\rightarrow$ NO-GO.'} />);

    expect(html).toContain('katex');
    expect(html).not.toContain('$\\rightarrow$');
  });
});
