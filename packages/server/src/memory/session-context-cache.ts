import type { PrefixedString } from '@stitch/shared/id';

const MAX_ENTRIES = 100;

const cache = new Map<PrefixedString<'ses'>, string>();

/** Returns the cached memory context for a session, or null if none is cached. */
export function getCachedSessionMemoryContext(sessionId: PrefixedString<'ses'>): string | null {
  return cache.get(sessionId) ?? null;
}

/** Caches the memory context for a session, evicting the oldest entry once the cap is exceeded. */
export function setCachedSessionMemoryContext(sessionId: PrefixedString<'ses'>, memoryContext: string): void {
  cache.delete(sessionId);
  cache.set(sessionId, memoryContext);

  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}
