import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { validateAbsoluteFilePath, writeFileContent } from '@/tools/write.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-write-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('write tool helpers', () => {
  test('accepts absolute paths', () => {
    const absolute = path.resolve(process.cwd(), 'file.txt');
    expect(validateAbsoluteFilePath(absolute)).toBe(path.resolve(absolute));
  });

  test('rejects non-absolute paths', () => {
    expect(() => validateAbsoluteFilePath('relative/file.txt')).toThrow(
      'filePath must be an absolute path',
    );
  });

  test('overwrites existing file content', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'old content', 'utf8');
    await writeFileContent(filePath, 'new content');

    const updated = await fs.readFile(filePath, 'utf8');
    expect(updated).toBe('new content');
  });
});