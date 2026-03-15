import { createHighlighter, type Highlighter } from 'shiki';

let sharedHighlighter: Highlighter | null = null;
let currentThemes: string[] = [];
let currentLangs: string[] = [];

const highlighterPromiseCache = new Map<string, Promise<Highlighter>>();

async function getSharedHighlighter(themes: string[], langs: string[]): Promise<Highlighter> {
  const cacheKey = `${themes.sort().join(',')}-${langs.sort().join(',')}`;

  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const themesChanged =
      sharedHighlighter === null ||
      themes.length !== currentThemes.length ||
      themes.some((t) => !currentThemes.includes(t));

    const langsChanged =
      sharedHighlighter === null ||
      langs.length !== currentLangs.length ||
      langs.some((l) => !currentLangs.includes(l));

    if (sharedHighlighter && !themesChanged && !langsChanged) {
      return sharedHighlighter;
    }

    const newThemes = themesChanged ? themes : currentThemes;
    const newLangs = langsChanged ? langs : currentLangs;

    if (sharedHighlighter) {
      sharedHighlighter.dispose();
    }

    sharedHighlighter = await createHighlighter({
      themes: newThemes,
      langs: newLangs,
    });

    currentThemes = newThemes;
    currentLangs = newLangs;

    return sharedHighlighter;
  })();

  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}

export function getHighlighterPromise(
  language: string,
  theme: 'light' | 'dark',
): Promise<Highlighter> {
  const themes = theme === 'dark' ? ['github-dark'] : ['github-light'];
  const langs = [language];

  const cacheKey = `${themes.join(',')}-${langs.join(',')}`;

  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = getSharedHighlighter(themes, langs);
  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}
