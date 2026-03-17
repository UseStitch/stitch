import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { editFileContent, MULTIPLE_MATCHES_ERROR } from '@/tools/edit.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openwork-edit-tool-'));
  tempDirs.push(dir);
  return dir;
}

describe('edit tool helpers', () => {
  test('replaces a single unique occurrence', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'alpha beta gamma', 'utf8');
    await editFileContent({
      filePath,
      oldString: 'beta',
      newString: 'delta',
    });

    const updated = await fs.readFile(filePath, 'utf8');
    expect(updated).toBe('alpha delta gamma');
  });

  test('replaces every occurrence when replaceAll is true', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'foo foo foo', 'utf8');
    await editFileContent({
      filePath,
      oldString: 'foo',
      newString: 'bar',
      replaceAll: true,
    });

    const updated = await fs.readFile(filePath, 'utf8');
    expect(updated).toBe('bar bar bar');
  });

  test('throws when oldString is not found', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'alpha beta gamma', 'utf8');

    await expect(
      editFileContent({
        filePath,
        oldString: 'not-here',
        newString: 'delta',
      }),
    ).rejects.toThrow('oldString not found in content');
  });

  test('throws when oldString appears multiple times without replaceAll', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'foo foo foo', 'utf8');

    await expect(
      editFileContent({
        filePath,
        oldString: 'foo',
        newString: 'bar',
      }),
    ).rejects.toThrow(MULTIPLE_MATCHES_ERROR);
  });

  test('rejects non-absolute paths', async () => {
    await expect(
      editFileContent({
        filePath: 'relative/file.txt',
        oldString: 'x',
        newString: 'y',
      }),
    ).rejects.toThrow('filePath must be an absolute path');
  });

  test('rejects when newString equals oldString', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'example.txt');

    await fs.writeFile(filePath, 'alpha', 'utf8');

    await expect(
      editFileContent({
        filePath,
        oldString: 'alpha',
        newString: 'alpha',
      }),
    ).rejects.toThrow('newString must be different from oldString');
  });
});
