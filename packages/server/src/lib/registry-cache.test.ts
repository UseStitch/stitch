import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRegistryCache, type FetchLike } from '@/lib/registry-cache.js';

const tempDirs: string[] = [];

async function createTempCacheFilePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-registry-cache-test-'));
  tempDirs.push(dir);
  return path.join(dir, 'registry.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const PAYLOAD = { version: 1, items: ['a', 'b'] };
const parse = (raw: unknown) => raw as typeof PAYLOAD;

function okFetch(payload: unknown): FetchLike {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function failFetch(): FetchLike {
  return async () => {
    throw new Error('network unavailable');
  };
}

function errorFetch(status: number): FetchLike {
  return async () => new Response(null, { status });
}

describe('createRegistryCache', () => {
  test('fetches from network and writes disk cache on first get', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    const result = await cache.get(okFetch(PAYLOAD));

    expect(result).toEqual(PAYLOAD);
    const written = JSON.parse(await fs.readFile(cacheFilePath, 'utf8'));
    expect(written).toEqual(PAYLOAD);
  });

  test('returns in-memory cache on second get without fetching', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    await cache.get(okFetch(PAYLOAD));

    let fetchCalled = false;
    const neverFetch: FetchLike = async () => {
      fetchCalled = true;
      throw new Error('should not be called');
    };

    const result = await cache.get(neverFetch);
    expect(result).toEqual(PAYLOAD);
    expect(fetchCalled).toBe(false);
  });

  test('reads from disk cache and skips network', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await fs.writeFile(cacheFilePath, JSON.stringify(PAYLOAD), 'utf8');

    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    let fetchCalled = false;
    const neverFetch: FetchLike = async () => {
      fetchCalled = true;
      throw new Error('should not be called');
    };

    const result = await cache.get(neverFetch);
    expect(result).toEqual(PAYLOAD);
    expect(fetchCalled).toBe(false);
  });

  test('ignores invalid disk cache and fetches from network', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await fs.writeFile(cacheFilePath, 'not valid json', 'utf8');

    const throwingParse = (raw: unknown) => {
      if ((raw as Record<string, unknown>)['version'] === undefined) {
        throw new Error('invalid');
      }
      return raw as typeof PAYLOAD;
    };

    const cache = createRegistryCache({
      cacheFilePath,
      url: 'https://example.com',
      parse: throwingParse,
    });

    const result = await cache.get(okFetch(PAYLOAD));
    expect(result).toEqual(PAYLOAD);
  });

  test('returns fallback when network fails and no disk cache exists', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const fallback = { version: 0, items: ['fallback'] };
    const cache = createRegistryCache({
      cacheFilePath,
      url: 'https://example.com',
      parse,
      fallback,
    });

    const result = await cache.get(failFetch());
    expect(result).toEqual(fallback);
  });

  test('throws when network fails and no fallback is configured', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    expect(cache.get(failFetch())).rejects.toThrow();
  });

  test('throws when server returns non-ok status and no fallback', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    expect(cache.get(errorFetch(503))).rejects.toThrow('HTTP 503');
  });

  test('refresh fetches and writes disk cache, clears in-memory cache', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    await cache.get(okFetch(PAYLOAD));

    const updated = { version: 2, items: ['c'] };
    await cache.refresh(okFetch(updated));

    const written = JSON.parse(await fs.readFile(cacheFilePath, 'utf8'));
    expect(written).toEqual(updated);

    // After refresh the in-memory cache is cleared so next get re-reads from disk.
    const result = await cache.get(failFetch());
    expect(result).toEqual(updated);
  });

  test('refresh silently ignores network failures', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    expect(cache.refresh(failFetch())).resolves.toBeUndefined();
  });

  test('reset clears in-memory cache so disk is re-read on next get', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const cache = createRegistryCache({ cacheFilePath, url: 'https://example.com', parse });

    await cache.get(okFetch(PAYLOAD));
    cache.reset();

    const updated = { version: 3, items: ['x'] };
    await fs.writeFile(cacheFilePath, JSON.stringify(updated), 'utf8');

    const result = await cache.get(failFetch());
    expect(result).toEqual(updated);
  });
});
