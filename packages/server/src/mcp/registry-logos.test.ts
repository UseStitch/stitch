import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getMcpRegistryLogo } from '@/mcp/registry-logos.js';
import { clearMcpRegistryCacheForTests } from '@/mcp/registry-service.js';

type FetchLike = NonNullable<Parameters<typeof getMcpRegistryLogo>[1]>['fetchImpl'];

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" />';
const tempDirs: string[] = [];

function registryPayload(logoUrl?: string) {
  return {
    version: 1,
    generatedAt: '2026-04-13T12:00:00.000Z',
    servers: [
      {
        id: 'alpha',
        name: 'Alpha',
        description: 'Alpha server',
        docsUrl: 'https://example.com/docs',
        logoUrl,
        tags: ['search'],
        install: {
          name: 'Alpha',
          transport: 'http' as const,
          url: 'https://example.com/mcp',
          authConfig: { type: 'none' as const },
        },
      },
    ],
  };
}

async function createTempDirs() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-mcp-registry-logos-test-'));
  tempDirs.push(dir);
  return {
    cacheDir: path.join(dir, 'logos'),
    registryCacheFilePath: path.join(dir, 'mcp-registry.json'),
  };
}

afterEach(async () => {
  clearMcpRegistryCacheForTests();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('mcp registry logos', () => {
  test('returns cached logo without fetching', async () => {
    const { cacheDir, registryCacheFilePath } = await createTempDirs();
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'alpha.svg'), SVG, 'utf8');

    const fetchImpl: FetchLike = async () => {
      throw new Error('fetch should not be called');
    };

    expect(
      getMcpRegistryLogo('alpha', { cacheDir, registryCacheFilePath, fetchImpl }),
    ).resolves.toBe(SVG);
  });

  test('fetches and caches registry logo', async () => {
    const { cacheDir, registryCacheFilePath } = await createTempDirs();
    await fs.writeFile(
      registryCacheFilePath,
      JSON.stringify(registryPayload('https://usestitch.ai/mcp/servers/alpha/logo.svg')),
      'utf8',
    );

    const fetchImpl: FetchLike = async () =>
      new Response(SVG, { status: 200, headers: { 'content-type': 'image/svg+xml' } });

    expect(
      getMcpRegistryLogo('alpha', { cacheDir, registryCacheFilePath, fetchImpl }),
    ).resolves.toBe(SVG);
    expect(fs.readFile(path.join(cacheDir, 'alpha.svg'), 'utf8')).resolves.toBe(SVG);
  });

  test('returns undefined when registry server has no logo url', async () => {
    const { cacheDir, registryCacheFilePath } = await createTempDirs();
    await fs.writeFile(registryCacheFilePath, JSON.stringify(registryPayload()), 'utf8');

    const fetchImpl: FetchLike = async () =>
      new Response(SVG, { status: 200, headers: { 'content-type': 'image/svg+xml' } });

    expect(
      getMcpRegistryLogo('alpha', { cacheDir, registryCacheFilePath, fetchImpl }),
    ).resolves.toBeUndefined();
  });

  test('rejects non-svg responses', async () => {
    const { cacheDir, registryCacheFilePath } = await createTempDirs();
    await fs.writeFile(
      registryCacheFilePath,
      JSON.stringify(registryPayload('https://usestitch.ai/mcp/servers/alpha/logo.svg')),
      'utf8',
    );

    const fetchImpl: FetchLike = async () =>
      new Response('not svg', { status: 200, headers: { 'content-type': 'text/plain' } });

    expect(
      getMcpRegistryLogo('alpha', { cacheDir, registryCacheFilePath, fetchImpl }),
    ).resolves.toBeUndefined();
  });
});
