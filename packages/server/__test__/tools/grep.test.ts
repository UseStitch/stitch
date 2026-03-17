import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { grepContent } from '@/tools/grep.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openwork-grep-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('grep tool helpers', () => {
  test('finds regex matches with file and line output', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.ts');
    await fs.writeFile(filePath, 'const alpha = 1;\nconst beta = 2;\n', 'utf8');

    const result = await grepContent({
      pattern: 'beta',
      path: dir,
      include: '*.ts',
    });

    expect(result.output).toContain('Found 1 matches');
    expect(result.output).toContain(filePath);
    expect(result.output).toContain('Line 2: const beta = 2;');
  });

  test('returns no files found when there are no matches', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'example.txt'), 'hello', 'utf8');

    const result = await grepContent({
      pattern: 'missing-pattern',
      path: dir,
    });

    expect(result.output).toBe('No files found');
  });

  test('rejects invalid regex pattern', async () => {
    const dir = await createTempDir();

    await expect(
      grepContent({
        pattern: '[unterminated',
        path: dir,
      }),
    ).rejects.toThrow('Invalid regex pattern');
  });

  test('rejects non-absolute path', async () => {
    await expect(
      grepContent({
        pattern: 'x',
        path: 'relative/path',
      }),
    ).rejects.toThrow('path must be an absolute directory path');
  });

  test('truncates after 100 matches for performance', async () => {
    const dir = await createTempDir();
    const lines = Array.from({ length: 140 }, () => 'match me').join('\n');
    await fs.writeFile(path.join(dir, 'many.txt'), lines, 'utf8');

    const result = await grepContent({
      pattern: 'match me',
      path: dir,
      include: '*.txt',
    });

    expect(result.output).toContain('Found at least 100 matches');
    expect(result.output).toContain('Results truncated at 100 matches');
  });
});
