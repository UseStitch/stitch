import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filepath: string): Promise<boolean> {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}

async function clearLogDir() {
  const entries = await fs.readdir(PATHS.logDir).catch(() => []);
  await Promise.all(entries.map((f) => fs.unlink(path.join(PATHS.logDir, f)).catch(() => {})));
}

async function writeLogFiles(names: string[]) {
  await fs.mkdir(PATHS.logDir, { recursive: true });
  await Promise.all(
    names.map((name) => fs.writeFile(path.join(PATHS.logDir, name), 'test', 'utf-8')),
  );
}

async function readLogOutput(): Promise<string> {
  const entries = await fs.readdir(PATHS.logDir).catch(() => []);
  const logs = await Promise.all(
    entries
      .filter((name) => name.endsWith('.log'))
      .map((name) => fs.readFile(path.join(PATHS.logDir, name), 'utf-8').catch(() => '')),
  );
  return logs.join('\n');
}

async function waitForLogOutput(message: string): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    const output = await readLogOutput();
    if (output.includes(message)) return output;
    await Bun.sleep(10);
  }
  return readLogOutput();
}

// Generates filenames matching log format: app.<date>.<count>.log
function dailyLogNames(count: number, startDate = new Date('2020-01-01')): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate.getTime() + i * 86_400_000);
    return `app.${d.toISOString().slice(0, 10)}.${i + 1}.log`;
  });
}

// ---------------------------------------------------------------------------
// Log.cleanup
// ---------------------------------------------------------------------------

describe('Log.cleanup', () => {
  beforeEach(async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();
  });

  afterEach(async () => {
    await clearLogDir();
  });

  test('does nothing when there are 10 or fewer log files', async () => {
    const files = dailyLogNames(10);
    await writeLogFiles(files);

    await Log.cleanup();

    for (const name of files) {
      expect(await fileExists(path.join(PATHS.logDir, name))).toBe(true);
    }
  });

  test('deletes the oldest file when there are 11 log files', async () => {
    const files = dailyLogNames(11);
    await writeLogFiles(files);

    await Log.cleanup();

    expect(await fileExists(path.join(PATHS.logDir, files[0]))).toBe(false);
    for (const name of files.slice(1)) {
      expect(await fileExists(path.join(PATHS.logDir, name))).toBe(true);
    }
  });

  test('keeps the 10 newest files when there are many', async () => {
    const files = dailyLogNames(20);
    await writeLogFiles(files);

    await Log.cleanup();

    for (const name of files.slice(0, 10)) {
      expect(await fileExists(path.join(PATHS.logDir, name))).toBe(false);
    }
    for (const name of files.slice(-10)) {
      expect(await fileExists(path.join(PATHS.logDir, name))).toBe(true);
    }
  });

  test('does nothing when the log directory does not exist', async () => {
    await fs.rm(PATHS.logDir, { recursive: true, force: true });
    await Log.cleanup();
  });
});

// ---------------------------------------------------------------------------
// Log.create
// ---------------------------------------------------------------------------

describe('Log.create', () => {
  test('returns a logger with all required methods', () => {
    const log = Log.create({ service: 'test-create' });
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.tag).toBe('function');
    expect(typeof log.clone).toBe('function');
    expect(typeof log.time).toBe('function');
  });

  test('tag() returns the same logger instance for chaining', () => {
    const log = Log.create({ service: 'test-tag' });
    const chained = log.tag('requestId', 'abc123');
    expect(chained).toBe(log);
  });

  test('clone() returns a different logger instance', () => {
    const log = Log.create({ service: 'test-clone' });
    const cloned = log.clone();
    expect(cloned).not.toBe(log);
  });

  test('returns the cached instance for the same service', () => {
    const a = Log.create({ service: 'test-cache' });
    const b = Log.create({ service: 'test-cache' });
    expect(a).toBe(b);
  });

  test('time() returns stop() and [Symbol.dispose]', () => {
    const log = Log.create({ service: 'test-time' });
    const timer = log.time('my-op');
    expect(typeof timer.stop).toBe('function');
    expect(typeof timer[Symbol.dispose]).toBe('function');
    timer.stop();
  });

  test('time() using-block calls stop via [Symbol.dispose]', () => {
    const log = Log.create({ service: 'test-using' });
    expect(() => {
      using _t = log.time('block-op');
    }).not.toThrow();
  });

  test('loggers created before init write after init', async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();

    const log = Log.create({ service: 'test-pre-init' });
    await Log.init({});

    log.info('pre-init logger is active');

    const output = await waitForLogOutput('pre-init logger is active');
    expect(output).toContain('pre-init logger is active');
    expect(output).toContain('test-pre-init');

    await clearLogDir();
  });
});
