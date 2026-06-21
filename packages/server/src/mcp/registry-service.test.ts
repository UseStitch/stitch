import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    expect(refreshResult.error).toBeNull();

    const listResult = await listMcpRegistryServers({ cacheFilePath });
    expect(listResult.error).toBeNull();
    if (listResult.error) return;

    expect(listResult.data.map((server) => server.name)).toEqual(['Alpha Server', 'Zulu Server']);

    const cachedText = await fs.readFile(cacheFilePath, 'utf8');
    const cachedPayload = JSON.parse(cachedText) as { servers: { id: string }[] };
    expect(cachedPayload.servers).toHaveLength(2);
  });

  test('sends Stitch user agent when fetching registry payload', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const captured = { userAgent: null as string | null };
    const fetchImpl: FetchLike = async (_input, init) => {
      captured.userAgent = new Headers(init?.headers).get('User-Agent');
      return new Response(JSON.stringify(REGISTRY_PAYLOAD), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await refreshMcpRegistryCache({
      cacheFilePath,
      fetchImpl,
      force: true,
    });

    expect(result.error).toBeNull();
    expect(captured.userAgent?.startsWith('Stitch/')).toBe(true);
    expect(captured.userAgent).toContain('RegistryClient/1');
  });

  test('uses disk cache when present', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    await fs.writeFile(cacheFilePath, JSON.stringify(REGISTRY_PAYLOAD), 'utf8');

    const fetchImpl: FetchLike = async () => {
      throw new Error('fetch should not be called');
    };

    const result = await listMcpRegistryServers({ cacheFilePath, fetchImpl });
    expect(result.error).toBeNull();
    if (result.error) return;

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

    expect(result.error).not.toBeNull();
    if (result.error) {
      expect(result.error.status).toBe(500);
    }
  });

  test('accepts an oauth authConfig variant', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const payload = {
      version: 1,
      generatedAt: '2026-04-13T12:00:00.000Z',
      servers: [
        {
          id: 'oauth-server',
          name: 'OAuth Server',
          description: 'o',
          docsUrl: 'https://example.com/o',
          tags: ['o'],
          install: {
            name: 'OAuth',
            transport: 'http' as const,
            url: 'https://example.com/o/mcp',
            authConfig: { type: 'oauth' as const, scopes: ['read'] },
          },
        },
      ],
    };
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const result = await refreshMcpRegistryCache({ cacheFilePath, fetchImpl, force: true });
    expect(result.error).toBeNull();
    if (result.error) return;
    expect(result.data.servers[0]?.install.authConfig).toEqual({ type: 'oauth', scopes: ['read'] });
  });

  test('rejects an oauth authConfig with a non-string scope', async () => {
    const cacheFilePath = await createTempCacheFilePath();
    const payload = {
      version: 1,
      generatedAt: '2026-04-13T12:00:00.000Z',
      servers: [
        {
          id: 'bad-oauth',
          name: 'Bad',
          description: 'b',
          docsUrl: 'https://example.com/b',
          tags: ['b'],
          install: {
            name: 'Bad',
            transport: 'http' as const,
            url: 'https://example.com/b/mcp',
            authConfig: { type: 'oauth' as const, scopes: [123] },
          },
        },
      ],
    };
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(payload), { status: 200 });

    const result = await refreshMcpRegistryCache({ cacheFilePath, fetchImpl, force: true });
    expect(result.error).not.toBeNull();
  });
});
