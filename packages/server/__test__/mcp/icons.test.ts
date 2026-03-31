import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { cacheMcpIcon, getMcpIconByKey } from '@/mcp/icons.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-mcp-icons-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('mcp icon cache', () => {
  test('stores and reads data URI icon from disk', async () => {
    const cacheDir = await createTempDir();

    const cached = await cacheMcpIcon({
      serverUrl: 'https://example.com/mcp',
      scope: 'server:test',
      cacheDir,
      icon: {
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/e+m+7QAAAABJRU5ErkJggg==',
      },
    });

    expect(cached).not.toBeNull();
    const icon = await getMcpIconByKey(cached!.key, { cacheDir });
    expect(icon).not.toBeNull();
    expect(icon?.mimeType).toBe('image/png');
    expect(icon?.body.length).toBeGreaterThan(0);
  });

  test('rejects remote icon from different origin', async () => {
    const cacheDir = await createTempDir();

    const cached = await cacheMcpIcon({
      serverUrl: 'https://trusted.example.com/mcp',
      scope: 'server:test',
      cacheDir,
      icon: {
        src: 'https://evil.example.com/icon.png',
      },
    });

    expect(cached).toBeNull();
  });
});
