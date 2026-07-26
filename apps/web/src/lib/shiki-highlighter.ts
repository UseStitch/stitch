import { createHighlighter, type Highlighter } from 'shiki';

let sharedHighlighter: Highlighter | null = null;
let currentThemes: string[] = [];
let currentLangs: string[] = [];

const highlighterPromiseCache = new Map<string, Promise<Highlighter>>();

async function getSharedHighlighter(themes: string[], langs: string[]): Promise<Highlighter> {
  const cacheKey = `${themes.toSorted().join(',')}-${langs.toSorted().join(',')}`;

  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const currentThemeSet = new Set(currentThemes);
    const themesChanged =
      sharedHighlighter === null ||
      themes.length !== currentThemes.length ||
      themes.some((t) => !currentThemeSet.has(t));

    const currentLangSet = new Set(currentLangs);
    const langsChanged =
      sharedHighlighter === null || langs.length !== currentLangs.length || langs.some((l) => !currentLangSet.has(l));

    if (sharedHighlighter && !themesChanged && !langsChanged) {
      return sharedHighlighter;
    }

    const newThemes = themesChanged ? themes : currentThemes;
    const newLangs = langsChanged ? langs : currentLangs;

    if (sharedHighlighter) {
      sharedHighlighter.dispose();
    }

    sharedHighlighter = await createHighlighter({ themes: newThemes, langs: newLangs });

    currentThemes = newThemes;
    currentLangs = newLangs;

    return sharedHighlighter;
  })();

  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}

export function getHighlighterPromise(language: string): Promise<Highlighter> {
  const themes = ['github-light', 'github-dark'];
  const langs = [language];

  const cacheKey = `${themes.join(',')}-${langs.join(',')}`;

  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = getSharedHighlighter(themes, langs);
  highlighterPromiseCache.set(cacheKey, promise);
  return promise;
}
