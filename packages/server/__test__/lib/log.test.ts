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

  test('deletes one old file when startup also creates a current log', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 5, startingAt, ONE_DAY);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-02T00:00:00.000Z'));
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, '2020-01-01T000000.log'))).toBe(false);
    for (const filename of oldFiles.slice(1)) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-02.log'))).toBe(true);
  });

  test('deletes the oldest file when threshold exceeded by 6', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, '2020-01-01T000000.log'))).toBe(false);
  });

  test('preserves nine newest old files plus the current log at startup', async () => {
    const startingAt = new Date('2020-01-01');
    const oldFiles = createLogFiles(CLEANUP_THRESHOLD + 6, startingAt, ONE_DAY);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-02T00:00:00.000Z'));
    await writeFiles(oldFiles);

    await Log.init({ print: false });

    for (const filename of oldFiles.slice(-9)) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-02.log'))).toBe(true);
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
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-02.log'))).toBe(true);
  });

  test('rotates to a new daily log file after midnight in production', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-02T23:59:59.000Z'));

    await Log.init({ print: false });
    const log = Log.create({ service: 'test' });

    expect(await fileExists(path.join(PATHS.logDir, '2025-11-02.log'))).toBe(true);

    vi.setSystemTime(new Date('2025-11-03T00:00:01.000Z'));
    log.info('rotated');

    vi.useRealTimers();
    await waitForFileExists(path.join(PATHS.logDir, '2025-11-03.log'));
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-03.log'))).toBe(true);
  });

  test('cleanup deletes the oldest daily log and preserves the newest 10', async () => {
    const dailyFiles = createDailyLogFiles(11, new Date('2025-11-01'));
    await writeFiles(dailyFiles);

    await Log.init({ print: true });

    expect(await fileExists(path.join(PATHS.logDir, '2025-11-01.log'))).toBe(false);
    for (const filename of dailyFiles.slice(-10)) {
      expect(await fileExists(path.join(PATHS.logDir, filename))).toBe(true);
    }
  });

  test('cleanup preserves the current daily log with legacy timestamped logs present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-11T12:00:00.000Z'));

    const legacyFiles = createLogFiles(10, new Date('2025-11-01'), ONE_DAY);
    await writeFiles(legacyFiles);

    await Log.init({ print: false });

    expect(await fileExists(path.join(PATHS.logDir, '2025-11-11.log'))).toBe(true);
    expect(await fileExists(path.join(PATHS.logDir, '2025-11-01T000000.log'))).toBe(false);
  });
});

async function fileExists(filepath: string): Promise<boolean> {
  return fs.access(filepath).then(
    () => true,
    () => false,
  );
}

async function waitForFileExists(filepath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await fileExists(filepath)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for file: ${filepath}`);
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

function createDailyLogFiles(count: number, startDate: Date, increment = ONE_DAY): string[] {
  return Array.from({ length: count }, (_, index) => {
    const creationOffset = index * increment;
    const fileCreatedAt = new Date(startDate.getTime() + creationOffset);
    return `${fileCreatedAt.toISOString().slice(0, 10)}.log`;
  });
}
