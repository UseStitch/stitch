import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { readPathContent } from '@/tools/core/read.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-read-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('read tool helpers', () => {
  test('reads file content with line number prefixes', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');
    await fs.writeFile(filePath, 'alpha\nbeta\ngamma\n', 'utf8');

    const result = await readPathContent({ filePath });
    expect(result.output).toBe('1: alpha\n2: beta\n3: gamma');
  });

  test('supports offset and limit when reading file content', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');
    await fs.writeFile(filePath, 'one\ntwo\nthree\nfour', 'utf8');

    const result = await readPathContent({
      filePath,
      offset: 2,
      limit: 2,
    });

    expect(result.output).toBe('2: two\n3: three');
  });

  test('lists directory entries and marks subdirectories', async () => {
    const dir = await createTempDir();
    const nested = path.join(dir, 'nested');
    const filePath = path.join(dir, 'file.txt');
    await fs.mkdir(nested);
    await fs.writeFile(filePath, 'content', 'utf8');

    const result = await readPathContent({ filePath: dir });
    expect(result.output).toBe('file.txt\nnested/');
  });

  test('truncates lines longer than 2000 characters', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'long.txt');
    await fs.writeFile(filePath, `${'a'.repeat(2100)}\nshort`, 'utf8');

    const result = await readPathContent({ filePath });
    const [firstLine] = result.output.split('\n');
    expect(firstLine).toBe(`1: ${'a'.repeat(2000)}`);
  });

  test('rejects non-absolute paths', async () => {
    await expect(readPathContent({ filePath: 'relative/file.txt' })).rejects.toThrow(
      'filePath must be an absolute path',
    );
  });

  test('throws when path does not exist', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'missing.txt');

    await expect(readPathContent({ filePath })).rejects.toThrow();
  });

  test('rejects non-text files', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'image.png');
    await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));

    await expect(readPathContent({ filePath })).rejects.toThrow('Only text files are supported');
  });
});
