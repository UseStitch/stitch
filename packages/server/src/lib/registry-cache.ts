import fs from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'registry-cache' });
const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type RegistryCacheOptions<T> = {
  /** Absolute path to the disk cache file. */
  cacheFilePath: string;
  /** Remote URL to fetch when no cache is available. */
  url: string;
  /** Parse and validate a raw JSON value into domain type T. Throws on invalid input. */
  parse: (raw: unknown) => T;
  /** Fallback value to use if both network and disk cache are unavailable. */
  fallback?: T;
  /** Fetch timeout in milliseconds. Defaults to 10 000. */
  timeoutMs?: number;
  /** Inject a custom fetch implementation (useful for tests). */
  fetchImpl?: FetchLike;
};

/**
 * Generic registry cache.
 *
 * Resolution order:
 *   1. In-memory singleton (fastest path, cleared by `refresh`)
 *   2. Disk cache (survives restarts, re-validated via `parse` on read)
 *   3. Remote fetch (result written to disk)
 *   4. `fallback` value if provided
 *
 * Deliberately knows nothing about LLM models or embeddings.
 */
export function createRegistryCache<T>(options: RegistryCacheOptions<T>) {
  const { cacheFilePath, url, parse, fallback, fetchImpl: defaultFetch = fetch } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let memory: T | null = null;

  async function readFromDisk(): Promise<T | null> {
    const text = await fs.readFile(cacheFilePath, 'utf8').catch(() => null);
    if (!text) return null;

    try {
      return parse(JSON.parse(text));
    } catch (error) {
      log.warn({ error, cacheFilePath }, 'failed to parse registry disk cache, ignoring');
      return null;
    }
  }

  async function writeToDisk(value: T): Promise<void> {
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await fs.writeFile(cacheFilePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async function fetchFromNetwork(fetchImpl: FetchLike): Promise<T> {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parse(await response.json());
  }

  /**
   * Returns the cached registry. Populates and writes disk cache on first fetch.
   * Uses `fallback` if network is unreachable and no disk cache exists.
   */
  async function get(fetchImpl: FetchLike = defaultFetch): Promise<T> {
    if (memory) return memory;

    const fromDisk = await readFromDisk();
    if (fromDisk) {
      memory = fromDisk;
      return fromDisk;
    }

    try {
      const fetched = await fetchFromNetwork(fetchImpl);
      await writeToDisk(fetched);
      memory = fetched;
      return fetched;
    } catch (error) {
      log.warn({ error, url }, 'failed to fetch registry from network');
      if (fallback !== undefined) {
        memory = fallback;
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Forces a network refresh and writes the result to disk.
   * Clears the in-memory cache on success so the next `get` returns fresh data.
   */
  async function refresh(fetchImpl: FetchLike = defaultFetch): Promise<void> {
    try {
      const fetched = await fetchFromNetwork(fetchImpl);
      await writeToDisk(fetched);
      memory = null;
    } catch (error) {
      log.error({ error, url }, 'failed to refresh registry');
    }
  }

  /** Clears the in-memory singleton (primarily useful in tests). */
  function reset(): void {
    memory = null;
  }

  return { get, refresh, reset };
}
