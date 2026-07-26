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

  test('renders GitHub-style callouts', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'> [!WARNING]\n> Check this first.'} />);

    expect(html).toContain('class="markdown-callout markdown-callout-warning"');
    expect(html).toContain('class="markdown-callout-title"');
    expect(html).toContain('Check this first.');
    expect(html).not.toContain('[!WARNING]');
  });

  test('renders highlight, subscript, and superscript syntax', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text="==important== H~2~O x^2^ and ~~removed~~" />);

    expect(html).toContain('<mark>important</mark>');
    expect(html).toContain('H<sub>2</sub>O');
    expect(html).toContain('x<sup>2</sup>');
    expect(html).toContain('<del>removed</del>');
  });

  test('renders safe basic HTML and removes unsafe HTML', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown
        text={
          '<mark>safe</mark> <abbr title="HyperText Markup Language">HTML</abbr> <script>alert(1)</script> <span style="color: red" onclick="alert(2)">text</span>'
        }
      />,
    );

    expect(html).toContain('<mark>safe</mark>');
    expect(html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(html).toContain('<span>text</span>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('onclick');
  });

  test('renders safe basic HTML while streaming', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd>.'} isStreaming />);

    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).toContain('<kbd>Shift</kbd>');
    expect(html).not.toContain('&lt;kbd&gt;');
  });

  test('preserves GFM task-list markup through sanitization', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'- [x] Done\n- [ ] Todo'} />);

    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled="" checked=""/> Done</li>');
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled=""/> Todo</li>');
  });

  test('preserves display math through sanitization', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'Before\n\n$$\nx^2\n$$\n\nAfter'} />);

    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('math-display');
    expect(html).not.toContain('katex-error');
  });

  test('uses the shared thin scrollbar for streaming code blocks', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={'```text\nlong code line\n```'} isStreaming />);

    expect(html).toContain('<pre class="thin-scrollbar">');
  });

  test('keeps safe URL schemes regardless of casing', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown text={'[safe](HTTPS://example.com) <a href="JaVaScRiPt:alert(1)">unsafe</a>'} />,
    );

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>unsafe</a>');
    expect(html).not.toContain('javascript:');
  });

  test('keeps escaped text-mark delimiters literal', () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={String.raw`\~sub\~ \^sup\^ \==mark\==`} />);

    expect(html).toContain('<p>~sub~ ^sup^ ==mark==</p>');
    expect(html).not.toContain('<sub>');
    expect(html).not.toContain('<sup>');
    expect(html).not.toContain('<mark>');
  });

  test('does not highlight delimiters around math while streaming', () => {
    const streamingHtml = renderToStaticMarkup(<ChatMarkdown text="==$x^2$==" isStreaming />);
    const completedHtml = renderToStaticMarkup(<ChatMarkdown text="==$x^2$==" />);

    expect(streamingHtml).toContain('==$x^2$==');
    expect(streamingHtml).not.toContain('<mark>');
    expect(completedHtml).toContain('katex');
    expect(completedHtml).not.toContain('<mark>');
  });
});
