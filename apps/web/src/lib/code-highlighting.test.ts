import { describe, expect, test } from 'bun:test';

import { createHighlightCacheKey, getHighlighterPromise, highlightToHast } from './code-highlighting';

import { getTheme } from '@/lib/theme';

const GITHUB = getTheme('default').code;
const DRACULA = getTheme('dracula').code;

function rootPre(hast: ReturnType<typeof highlightToHast>) {
  const pre = hast.children[0];
  if (pre === undefined || pre.type !== 'element') throw new Error('expected a root pre element');
  return pre;
}

describe('highlightToHast', () => {
  test('leaves the container background to theme tokens instead of the Shiki theme', async () => {
    const highlighter = await getHighlighterPromise('typescript', [GITHUB.light, GITHUB.dark]);

    const pre = rootPre(highlightToHast(highlighter, 'const a = 1;', 'typescript', GITHUB));

    expect(pre.properties.style).toBeUndefined();
  });

  test('uses the shared thin scrollbar utility', async () => {
    const highlighter = await getHighlighterPromise('typescript', [GITHUB.light, GITHUB.dark]);

    const pre = rootPre(highlightToHast(highlighter, 'const a = 1;', 'typescript', GITHUB));

    expect(String(pre.properties.class)).toContain('thin-scrollbar');
  });

  test('applies the theme pair supplied by the caller', async () => {
    const highlighter = await getHighlighterPromise('typescript', [DRACULA.light, DRACULA.dark]);

    const pre = rootPre(highlightToHast(highlighter, 'const a = 1;', 'typescript', DRACULA));

    expect(String(pre.properties.class)).toContain(DRACULA.light);
    expect(String(pre.properties.class)).toContain(DRACULA.dark);
  });

  test('produces different token colors per theme for identical code', async () => {
    const code = 'const a = 1;';
    const [githubHighlighter, draculaHighlighter] = await Promise.all([
      getHighlighterPromise('typescript', [GITHUB.light, GITHUB.dark]),
      getHighlighterPromise('typescript', [DRACULA.light, DRACULA.dark]),
    ]);

    const github = highlightToHast(githubHighlighter, code, 'typescript', GITHUB);
    const dracula = highlightToHast(draculaHighlighter, code, 'typescript', DRACULA);

    expect(JSON.stringify(dracula)).not.toEqual(JSON.stringify(github));
  });

  test('falls back to plain text when the grammar is not loaded', async () => {
    const highlighter = await getHighlighterPromise('text', [GITHUB.light, GITHUB.dark]);

    const hast = highlightToHast(highlighter, 'fn main() {}', 'rust', GITHUB);

    expect(JSON.stringify(hast)).toContain('fn main() {}');
  });
});

describe('getHighlighterPromise', () => {
  test('keeps earlier languages usable after another language loads', async () => {
    const first = await getHighlighterPromise('python', [GITHUB.light, GITHUB.dark]);
    await getHighlighterPromise('go', [GITHUB.light, GITHUB.dark]);

    expect(() => highlightToHast(first, 'def f(): pass', 'python', GITHUB)).not.toThrow();
  });

  test('keeps earlier themes usable after another theme loads', async () => {
    const first = await getHighlighterPromise('json', [GITHUB.light, GITHUB.dark]);
    await getHighlighterPromise('json', [DRACULA.light, DRACULA.dark]);

    expect(() => highlightToHast(first, '{"a":1}', 'json', GITHUB)).not.toThrow();
  });
});

describe('createHighlightCacheKey', () => {
  test('separates identical code highlighted under different themes', () => {
    const github = createHighlightCacheKey('const a = 1;', 'typescript', `${GITHUB.light}-${GITHUB.dark}`);
    const dracula = createHighlightCacheKey('const a = 1;', 'typescript', `${DRACULA.light}-${DRACULA.dark}`);

    expect(dracula).not.toEqual(github);
  });
});
