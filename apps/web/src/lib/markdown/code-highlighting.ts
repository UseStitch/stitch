import {
  createHighlighter,
  bundledThemes,
  type BundledLanguage,
  type Highlighter,
  type ShikiTransformer,
} from 'shiki';

import type { CodeTheme } from '@/lib/theme';

export type HighlightedCodeHast = ReturnType<Highlighter['codeToHast']>;

interface LRUEntry<T> {
  value: T;
  size: number;
}

class LRUCache<T> {
  private cache: Map<string, LRUEntry<T>> = new Map();
  private totalSize = 0;

  constructor(
    private maxEntries: number,
    private maxMemoryBytes: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, size: number): void {
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.totalSize -= existingEntry.size;
      this.cache.delete(key);
    }

    while ((this.cache.size >= this.maxEntries || this.totalSize + size > this.maxMemoryBytes) && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      const removed = this.cache.get(firstKey);
      if (removed) {
        this.totalSize -= removed.size;
      }
      this.cache.delete(firstKey);
    }

    const entry: LRUEntry<T> = { value, size };
    this.cache.set(key, entry);
    this.totalSize += size;
  }
}

const MAX_HIGHLIGHT_CACHE_ENTRIES = 500;
const MAX_HIGHLIGHT_CACHE_MEMORY_BYTES = 50 * 1024 * 1024;

const _highlightedCodeCache = new LRUCache<HighlightedCodeHast>(
  MAX_HIGHLIGHT_CACHE_ENTRIES,
  MAX_HIGHLIGHT_CACHE_MEMORY_BYTES,
);

export const highlightedCodeCache = _highlightedCodeCache;

export function createHighlightCacheKey(code: string, language: string, themeName: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${Math.abs(hash).toString(36)}:${code.length}:${language}:${themeName}`;
}

export function estimateHighlightedSize(hast: HighlightedCodeHast, code: string): number {
  return Math.max(JSON.stringify(hast).length * 2, code.length * 3);
}

export type SupportedLanguage = BundledLanguage | 'text';

const SUPPORTED_LANGUAGES = [
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'json',
    'html',
    'css',
    'python',
    'bash',
    'shell',
    'markdown',
    'yaml',
    'xml',
    'sql',
    'go',
    'rust',
    'java',
    'c',
    'cpp',
    'csharp',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'scala',
    'r',
    'lua',
    'perl',
    'haskell',
    'elixir',
    'erlang',
    'clojure',
    'fsharp',
    'ocaml',
    'vim',
    'diff',
    'dockerfile',
    'makefile',
    'graphql',
    'regex',
    'toml',
    'ini',
    'text',
 ] satisfies readonly SupportedLanguage[];

const BUNDLED_THEME_NAMES = new Set(Object.keys(bundledThemes));

function isSupportedLanguage(language: string): language is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((supportedLanguage) => supportedLanguage === language);
}

function isBundledTheme(theme: string): theme is keyof typeof bundledThemes {
  return BUNDLED_THEME_NAMES.has(theme);
}

function normalizeLanguage(raw: string): SupportedLanguage {

  const lang = raw.toLowerCase();
  if (isSupportedLanguage(lang)) {
    return lang;
  }
  if (lang === 'gitignore') {
    return 'ini';
  }
  if (lang === 'sh' || lang === 'zsh') {
    return 'bash';
  }
  if (lang === 'js') {
    return 'javascript';
  }
  if (lang === 'ts') {
    return 'typescript';
  }
  if (lang === 'py') {
    return 'python';
  }
  return 'text';
}

export { normalizeLanguage };

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
    PLAIN_TEXT_LANGUAGES.has(language) ? Promise.resolve() : highlighter.loadLanguage(normalizeLanguage(language)),
    ...themes.flatMap((theme) => (isBundledTheme(theme) ? [highlighter.loadTheme(theme)] : [])),
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

/** Drops Shiki's inline background/foreground so the theme tokens in CSS own the container. */
const STRIP_ROOT_COLORS: ShikiTransformer = {
  pre(node) {
    delete node.properties.style;
    node.properties.class = `${String(node.properties.class ?? '')} thin-scrollbar`.trim();
  },
};

export function highlightToHast(
  highlighter: Highlighter,
  code: string,
  language: SupportedLanguage,
  themes: CodeTheme,
): HighlightedCodeHast {
  const options = { themes, transformers: [STRIP_ROOT_COLORS] };

  try {
    return highlighter.codeToHast(code, { ...options, lang: language });
  } catch (error) {
    console.warn(
      `Code highlighting failed for language "${language}", falling back to plain text.`,
      Error.isError(error) ? error.message : error,
    );
    return highlighter.codeToHast(code, { ...options, lang: 'text' });
  }
}
