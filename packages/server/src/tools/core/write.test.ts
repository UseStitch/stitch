import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeFileContent } from '@/tools/core/write.js';
import { validateAbsoluteFilePath } from '@/tools/runtime/shared.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-write-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('validateAbsoluteFilePath', () => {
  test('accepts absolute paths', () => {
    const absolute = path.resolve(process.cwd(), 'file.txt');
    expect(validateAbsoluteFilePath(absolute)).toBe(path.resolve(absolute));
  });

  test('rejects non-absolute paths', () => {
    expect(() => validateAbsoluteFilePath('relative/file.txt')).toThrow(
      'filePath must be an absolute path',
    );
  });
});

describe('writeFileContent', () => {
  test('overwrites existing file content', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'old content', 'utf8');
    await writeFileContent(filePath, 'new content');

    const updated = await fs.readFile(filePath, 'utf8');
    expect(updated).toBe('new content');
  });

  test('creates a new file in an existing directory', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'brand-new.txt');

    const returnedPath = await writeFileContent(filePath, 'fresh content');

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('fresh content');
    expect(returnedPath).toBe(path.resolve(filePath));
  });

  test('throws when parent directory does not exist', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'nonexistent', 'nested', 'file.txt');

    expect(writeFileContent(filePath, 'content')).rejects.toThrow();
  });

  test('handles empty content', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'empty.txt');

    await writeFileContent(filePath, '');

    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(0);

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('');
  });

  test('preserves file permissions on overwrite', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'perms.txt');

    await fs.writeFile(filePath, 'initial', 'utf8');

    if (process.platform !== 'win32') {
      await fs.chmod(filePath, 0o644);
    }

    const statBefore = await fs.stat(filePath);
    await writeFileContent(filePath, 'updated');
    const statAfter = await fs.stat(filePath);

    expect(statAfter.mode).toBe(statBefore.mode);
  });

  test('handles unicode content correctly', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'unicode.txt');
    const unicodeContent = '你好世界 🌍 café naïve résumé ñ — em dash';

    await writeFileContent(filePath, unicodeContent);

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe(unicodeContent);
  });

  test('rejects writing to path that is an existing directory', async () => {
    const dir = await createTempDir();
    const subDir = path.join(dir, 'subdir');
    await fs.mkdir(subDir);

    expect(writeFileContent(subDir, 'content')).rejects.toThrow();
  });

  test('rejects relative path via validation', async () => {
    expect(writeFileContent('relative/path.txt', 'content')).rejects.toThrow(
      'filePath must be an absolute path',
    );
  });
});
