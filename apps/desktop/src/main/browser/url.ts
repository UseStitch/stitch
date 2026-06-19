import type { RawData } from 'ws';

export const DEFAULT_URL = 'about:blank';

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function searchUrl(query: string, engine = 'google'): string {
  const encoded = encodeURIComponent(query);
  if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encoded}`;
  if (engine === 'bing') return `https://www.bing.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

export function rawSocketDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}
