import { createHighlighter, type BundledLanguage, type BundledTheme, type Highlighter } from 'shiki';

/**
 * Never disposed: `use()` callers hold resolved promises, so replacing the instance would
 * hand them a disposed highlighter that throws on the next render.
 */
let highlighterPromise: Promise<Highlighter> | null = null;

const readyCache = new Map<string, Promise<Highlighter>>();

// Shiki resolves plain text without a grammar, and `loadLanguage('text')` throws.
const PLAIN_TEXT_LANGUAGES = new Set(['text', 'plaintext', 'txt']);

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [], langs: [] });
  return highlighterPromise;
}

async function loadInto(language: string, themes: readonly string[]): Promise<Highlighter> {
  const highlighter = await getHighlighter();

  await Promise.all([
    PLAIN_TEXT_LANGUAGES.has(language) ? Promise.resolve() : highlighter.loadLanguage(language as BundledLanguage),
    ...themes.map((theme) => highlighter.loadTheme(theme as BundledTheme)),
  ]);

  return highlighter;
}

/** Stable promise per language/theme pair so React's `use()` sees a consistent reference. */
export function getHighlighterPromise(language: string, themes: readonly string[]): Promise<Highlighter> {
  const cacheKey = `${language}|${themes.join(',')}`;

  const cached = readyCache.get(cacheKey);
  if (cached) return cached;

  const promise = loadInto(language, themes);
  readyCache.set(cacheKey, promise);
  return promise;
}
