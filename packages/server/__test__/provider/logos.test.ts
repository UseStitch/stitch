import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import * as ProviderLogos from '@/provider/logos.js';

async function tmpdir(): Promise<{ path: string; [Symbol.asyncDispose]: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-logos-test-'));
  return {
    path: dir,
    [Symbol.asyncDispose]: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe('provider logos cache', () => {
  test('returns cached logo without fetching', async () => {
    await using tmp = await tmpdir();
    await fs.writeFile(path.join(tmp.path, 'openai.svg'), '<svg>cached</svg>', 'utf8');

    const fetchImpl = vi.fn<typeof fetch>();
    const logo = await ProviderLogos.get('openai', { cacheDir: tmp.path, fetchImpl });

    expect(logo).toBe('<svg>cached</svg>');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('fetches and caches logo on cache miss', async () => {
    await using tmp = await tmpdir();

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<svg>remote</svg>', { status: 200 }),
    );

    const logo = await ProviderLogos.get('openai', { cacheDir: tmp.path, fetchImpl });
    const cached = await fs.readFile(path.join(tmp.path, 'openai.svg'), 'utf8');

    expect(logo).toBe('<svg>remote</svg>');
    expect(cached).toBe('<svg>remote</svg>');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('returns undefined when upstream logo is missing', async () => {
    await using tmp = await tmpdir();

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('missing', { status: 404 }));

    const logo = await ProviderLogos.get('openai', { cacheDir: tmp.path, fetchImpl });
    const cached = await fs.readFile(path.join(tmp.path, 'openai.svg'), 'utf8').catch(() => undefined);

    expect(logo).toBeUndefined();
    expect(cached).toBeUndefined();
  });

  test('returns undefined for non-allowed provider IDs', async () => {
    await using tmp = await tmpdir();

    const fetchImpl = vi.fn<typeof fetch>();
    const logo = await ProviderLogos.get('not-real-provider', { cacheDir: tmp.path, fetchImpl });

    expect(logo).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
