import { describe, expect, test } from 'bun:test';

import { serializeBrowserSnapshot } from '@/tools/toolsets/browser/snapshot-serializer.js';

describe('browser snapshot serializer', () => {
  test('keeps metadata and refs while enforcing a hard character budget', () => {
    const snapshot = [
      'URL: https://www.reddit.com/r/test/comments/abc/example',
      'Title: Example Reddit Thread',
      'Viewport: 834x879 @ 1x',
      '[ref=e1] link "Home" href="/"',
      '[ref=e2] button "Search"',
      '<script>{"props":"' + 'x'.repeat(3_000) + '"}</script>',
      ...Array.from({ length: 300 }, (_, i) => `Comment ${i}: ${'long text '.repeat(80)}`),
    ].join('\n');

    const result = serializeBrowserSnapshot(snapshot, { maxChars: 1_500, maxElements: 20 });

    expect(result.text.length).toBeLessThanOrEqual(1_570);
    expect(result.text).toContain('URL: https://www.reddit.com/r/test/comments/abc/example');
    expect(result.text).toContain('[ref=e1]');
    expect(result.text).toContain('[ref=e2]');
    expect(result.text).not.toContain('<script>');
    expect(result.truncated).toBe(true);
    expect(result.elementCount).toBe(2);
  });
});
