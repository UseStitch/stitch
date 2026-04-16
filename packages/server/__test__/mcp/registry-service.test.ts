import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  clearMcpRegistryCacheForTests,
  listMcpRegistryServers,
  refreshMcpRegistryCache,
} from '@/mcp/registry-service.js';

type FetchLike = NonNullable<
  NonNullable<Parameters<typeof listMcpRegistryServers>[0]>['fetchImpl']
>;

const tempDirs: string[] = [];

const REGISTRY_PAYLOAD = {
  version: 1,
  generatedAt: '2026-04-13T12:00:00.000Z',
  servers: [
    {
      id: 'z-server',
      name: 'Zulu Server',
      description: 'z',
      docsUrl: 'https://example.com/z',
      tags: ['z'],
      install: {
        name: 'Zulu',
        transport: 'http' as const,
        url: 'https://example.com/z/mcp',
        authConfig: { type: 'none' as const },
      },
    },
    {
      id: 'a-server',
      name: 'Alpha Server',
      description: 'a',
      docsUrl: 'https://example.com/a',
      tags: ['a'],
      install: {
        name: 'Alpha',
        transport: 'http' as const,
        url: 'https://example.com/a/mcp',
        authConfig: { type: 'none' as const },
      },
    },
  ],
};

async function createTempCacheFilePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-mcp-registry-test-'));
  tempDirs.push(dir);
  return path.join(dir, 'mcp-registry.json');
}

beforeEach(() => {
  clearMcpRegistryCacheForTests();
});

afterEach(async () => {
  clearMcpRegistryCacheForTests();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('mcp registry service', () => {
  test('downloads and caches registry payload', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify(REGISTRY_PAYLOAD), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const refreshResult = await refreshMcpRegistryCache({
      cacheFilePath,
      fetchImpl,
      force: true,
    });
    expect('error' in refreshResult).toBe(false);

    const listResult = await listMcpRegistryServers({ cacheFilePath });
    expect('error' in listResult).toBe(false);
    if ('error' in listResult) return;

    expect(listResult.data.map((server) => server.name)).toEqual(['Alpha Server', 'Zulu Server']);

    const cachedText = await fs.readFile(cacheFilePath, 'utf8');
    const cachedPayload = JSON.parse(cachedText) as { servers: { id: string }[] };
    expect(cachedPayload.servers).toHaveLength(2);
  });

  test('uses disk cache when present', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    await fs.writeFile(cacheFilePath, JSON.stringify(REGISTRY_PAYLOAD), 'utf8');

    const fetchImpl: FetchLike = async () => {
      throw new Error('fetch should not be called');
    };

    const result = await listMcpRegistryServers({ cacheFilePath, fetchImpl });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.data).toHaveLength(2);
  });

  test('returns service error when remote payload is invalid', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ version: 1, generatedAt: 'bad-date', servers: [] }), {
        status: 200,
      });

    const result = await refreshMcpRegistryCache({
      cacheFilePath,
      fetchImpl,
      force: true,
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(500);
    }
  });
});
