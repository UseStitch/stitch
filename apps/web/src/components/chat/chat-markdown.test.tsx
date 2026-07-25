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

  test('renders single-dollar inline math', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown text={'* $100,000 \\text{ LOC} \\approx 600,000 \\text{ tokens}$.'} />,
    );

    expect(html).toContain('katex');
    expect(html).toContain('≈');
    expect(html).not.toContain('$100,000 \\text{');
    expect(html).not.toContain('katex-error');
  });

  test('renders escaped dollars inside single-dollar inline math', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Cost: $\\$0.02 \\text{ per 1M tokens}$.'} />);

    expect(html).toContain('katex');
    expect(html).toContain('>$0.02<');
    expect(html).not.toContain('katex-error');
  });

  test('renders math and currency in the same paragraph', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Cursor charges $20/mo, we need $\\ge 95\\%$ margin.'} />);

    expect(html).toContain('$20/mo');
    expect(html).toContain('≥');
    expect(html).not.toContain('katex-error');
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
