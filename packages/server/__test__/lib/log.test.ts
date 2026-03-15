import fs from 'fs/promises';
import path from 'path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

describe('Log.init', () => {
  const CLEANUP_THRESHOLD = 5;

  beforeEach(async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await clearLogDir();
  });

  test('does not delete files when at threshold', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD, startingAt, ONE_DAY);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    for (const filename of oldFiles) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
  });

  test('does not delete files when threshold exceeded by 5', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 5, startingAt, ONE_DAY);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    for (const filename of oldFiles) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
  });

  test('deletes the oldest file when threshold exceeded by 6', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, '2020-01-01T000000.log'))).toBe(false);
  });

  test('preserves the newest 10 files when threshold exceeded by 6', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);
    const newestFiles = oldFiles.slice(-10);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    for (const filename of newestFiles) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
  });

  test('does not delete dev.log during cleanup', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);
    await writeFiles([...oldFiles, 'dev.log']);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, 'dev.log'))).toBe(true);
  });

  test('creates new log file after cleanup runs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-02T00:00:00.000Z'));
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, '2020-01-01T000000.log'))).toBe(false);
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-02T000000.log'))).toBe(true);
  });
});

async function fileExists(filepath: string): Promise<boolean> {
  return fs.access(filepath).then(
    () => true,
    () => false,
  );
}

async function clearLogDir() {
  const existingLogFiles = await fs.readdir(PATHS.logDir).catch(() => []);

  await Promise.all(
    existingLogFiles.map((existingLogFile) => {
      const filepath = path.join(PATHS.logDir, existingLogFile);
      return fs.unlink(filepath).catch(() => {});
    }),
  );
}

function writeFiles(filenames: string[]) {
  return Promise.all(
    filenames.map((f) => fs.writeFile(path.join(PATHS.logDir, f), 'test', 'utf-8')),
  );
}

const ONE_DAY = 1000 * 60 * 60 * 24;

function createLogFiles(count: number, startDate: Date, increment = ONE_DAY): string[] {
  return Array.from({ length: count }, (_, index) => {
    const creationOffset = index * increment;
    const fileCreatedAt = new Date(startDate.getTime() + creationOffset);
    return fileCreatedAt.toISOString().split('.')[0].replace(/:/g, '') + '.log';
  });
}
