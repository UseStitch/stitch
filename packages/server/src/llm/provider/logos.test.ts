import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';

import * as ProviderLogos from '@/llm/provider/logos.js';

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

    const logo = await ProviderLogos.get('openai', { cacheDir: tmp.path });

    expect(logo).toBe('<svg>cached</svg>');
  });

  test('returns undefined for non-allowed provider IDs', async () => {
    await using tmp = await tmpdir();

    const logo = await ProviderLogos.get('not-real-provider', { cacheDir: tmp.path });

    expect(logo).toBeUndefined();
  });
});
