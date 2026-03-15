import type { BundledLanguage } from 'shiki';

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

    while (
      (this.cache.size >= this.maxEntries || this.totalSize + size > this.maxMemoryBytes) &&
      this.cache.size > 0
    ) {
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

const _highlightedCodeCache = new LRUCache<string>(
  MAX_HIGHLIGHT_CACHE_ENTRIES,
  MAX_HIGHLIGHT_CACHE_MEMORY_BYTES,
);

export const highlightedCodeCache = _highlightedCodeCache;

export function createHighlightCacheKey(
  code: string,
  language: string,
  themeName: string,
): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${Math.abs(hash).toString(36)}:${code.length}:${language}:${themeName}`;
}

export function estimateHighlightedSize(html: string, code: string): number {
  return Math.max(html.length * 2, code.length * 3);
}

export type SupportedLanguage = BundledLanguage | 'text';

function normalizeLanguage(raw: string): SupportedLanguage {
  const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
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
  ];

  const lang = raw.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
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

export type { Highlighter } from 'shiki';
export { getHighlighterPromise } from './shiki-highlighter';
