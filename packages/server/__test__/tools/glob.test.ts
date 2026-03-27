import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { globPaths } from '@/tools/core/glob.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-glob-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('glob tool helpers', () => {
  test('returns matches sorted by modification time', async () => {
    const dir = await createTempDir();
    const older = path.join(dir, 'older.txt');
    const newer = path.join(dir, 'newer.txt');

    await fs.writeFile(older, 'old', 'utf8');
    await fs.writeFile(newer, 'new', 'utf8');
    await fs.utimes(older, new Date(1000), new Date(1000));
    await fs.utimes(newer, new Date(2000), new Date(2000));

    const result = await globPaths({
      pattern: '*.txt',
      path: dir,
    });

    expect(result.output.split('\n').slice(0, 2)).toEqual([newer, older]);
  });

  test('returns no files message when there are no matches', async () => {
    const dir = await createTempDir();

    const result = await globPaths({
      pattern: '*.tsx',
      path: dir,
    });

    expect(result.output).toBe('No files found');
  });

  test('rejects non-absolute path', async () => {
    await expect(
      globPaths({
        pattern: '*.ts',
        path: 'relative/path',
      }),
    ).rejects.toThrow('path must be an absolute directory path');
  });

  test('truncates output after 100 matches', async () => {
    const dir = await createTempDir();

    await Promise.all(
      Array.from({ length: 101 }).map((_, idx) =>
        fs.writeFile(path.join(dir, `file-${String(idx).padStart(3, '0')}.txt`), 'x', 'utf8'),
      ),
    );

    const result = await globPaths({
      pattern: '*.txt',
      path: dir,
    });

    expect(result.output).toContain('Results are truncated');
  });
});
