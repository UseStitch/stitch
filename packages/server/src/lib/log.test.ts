import { describe, test, expect, beforeEach, afterEach, setSystemTime } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

async function fileExists(filepath: string): Promise<boolean> {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}

// Mirrors the production formatDate in log.ts (local date components)
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function clearLogDir() {
  const entries = await fs.readdir(PATHS.logDir).catch(() => []);
  await Promise.all(entries.map((f) => fs.unlink(path.join(PATHS.logDir, f)).catch(() => {})));
}

async function writeLogFiles(names: string[]) {
  await fs.mkdir(PATHS.logDir, { recursive: true });
  await Promise.all(names.map((name) => fs.writeFile(path.join(PATHS.logDir, name), 'test', 'utf-8')));
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

describe('Log.create', () => {
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

  test('writes formatted text lines with tags and extras', async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();

    const log = Log.create({ service: 'test-format' });
    await Log.init({});

    log.info({ requestId: 'abc123', count: 2 }, 'formatted message');

    const output = await waitForLogOutput('formatted message');
    expect(output).toContain('INFO ');
    expect(output).toContain('service=test-format');
    expect(output).toContain('requestId=abc123');
    expect(output).toContain('count=2');
    expect(output).toContain('formatted message');

    await clearLogDir();
  });
});

describe('Log.close', () => {
  beforeEach(async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();
  });

  afterEach(async () => {
    await clearLogDir();
  });

  test('flushes buffered writes before resolving', async () => {
    const log = Log.create({ service: 'test-close' });
    await Log.init({});
    log.info('message before close');

    await Log.close();

    const output = await readLogOutput();
    expect(output).toContain('message before close');
  });

  test('writes after close are dropped without throwing', async () => {
    const log = Log.create({ service: 'test-close-after' });
    await Log.init({});
    await Log.close();

    expect(() => log.info('message after close')).not.toThrow();

    const output = await readLogOutput();
    expect(output).not.toContain('message after close');
  });

  test('resolves when called before init', async () => {
    await Log.close();
  });
});

describe('Log.create error serialization', () => {
  beforeEach(async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();
  });

  afterEach(async () => {
    await clearLogDir();
  });

  test('logs error message and name for a plain Error', async () => {
    const log = Log.create({ service: 'test-error-plain' });
    await Log.init({});

    log.error({ error: new Error('something went wrong') }, 'plain error');

    const output = await waitForLogOutput('plain error');
    expect(output).toContain('"name":"Error"');
    expect(output).toContain('"message":"something went wrong"');
  });

  test('logs custom fields from an Error subclass', async () => {
    class ConnectorVersionMismatchError extends Error {
      readonly connectorId: string;
      readonly currentVersion: number;
      readonly highestVersion: number;

      constructor(connectorId: string, currentVersion: number, highestVersion: number) {
        super(
          `Connector ${connectorId} currentVersion (${currentVersion}) must match highest versionHistory entry (${highestVersion})`,
        );
        this.name = 'ConnectorVersionMismatchError';
        this.connectorId = connectorId;
        this.currentVersion = currentVersion;
        this.highestVersion = highestVersion;
      }
    }

    const log = Log.create({ service: 'test-error-custom' });
    await Log.init({});

    log.error({ error: new ConnectorVersionMismatchError('google', 1, 2) }, 'version mismatch');

    const output = await waitForLogOutput('version mismatch');
    expect(output).toContain('"name":"ConnectorVersionMismatchError"');
    expect(output).toContain('"connectorId":"google"');
    expect(output).toContain('"currentVersion":1');
    expect(output).toContain('"highestVersion":2');
  });

  test('includes cause message when present', async () => {
    const cause = new Error('root cause');
    const error = new Error('outer error', { cause });

    const log = Log.create({ service: 'test-error-cause' });
    await Log.init({});

    log.error({ error }, 'caused error');

    const output = await waitForLogOutput('caused error');
    expect(output).toContain('"message":"outer error"');
    expect(output).toContain('"cause":"root cause"');
  });
});

describe('Log rotation', () => {
  beforeEach(async () => {
    await fs.mkdir(PATHS.logDir, { recursive: true });
    await clearLogDir();
  });

  afterEach(async () => {
    setSystemTime();
    await clearLogDir();
  });

  test('init does not truncate an existing same-day file', async () => {
    const today = formatDate(new Date());
    const logFile = path.join(PATHS.logDir, `app.${today}.1.log`);
    await fs.writeFile(logFile, 'existing line\n', 'utf-8');

    const log = Log.create({ service: 'test-no-truncate' });
    await Log.init({});
    log.info('new line after init');

    const output = await waitForLogOutput('new line after init');
    expect(output).toContain('existing line');
    expect(output).toContain('new line after init');
  });

  test('rolls to a new file when the date changes', async () => {
    const day1 = new Date('2030-03-01T12:00:00.000Z');
    const day2 = new Date('2030-03-02T12:00:00.000Z');

    setSystemTime(day1);
    const log = Log.create({ service: 'test-roll' });
    await Log.init({});
    log.info('day one message');
    await waitForLogOutput('day one message');

    setSystemTime(day2);
    log.info('day two message');
    await waitForLogOutput('day two message');

    const day1File = path.join(PATHS.logDir, `app.${formatDate(day1)}.1.log`);
    const day2File = path.join(PATHS.logDir, `app.${formatDate(day2)}.1.log`);

    expect(await fileExists(day1File)).toBe(true);
    expect(await fileExists(day2File)).toBe(true);

    const day1Content = await fs.readFile(day1File, 'utf-8');
    const day2Content = await fs.readFile(day2File, 'utf-8');

    expect(day1Content).toContain('day one message');
    expect(day1Content).not.toContain('day two message');
    expect(day2Content).toContain('day two message');
    expect(day2Content).not.toContain('day one message');
  });

  test('same-day restart appends instead of truncating', async () => {
    const today = formatDate(new Date());
    const logFile = path.join(PATHS.logDir, `app.${today}.1.log`);

    const log = Log.create({ service: 'test-restart' });
    await Log.init({});
    log.info('message A');
    await waitForLogOutput('message A');

    await Log.init({});
    log.info('message B');
    await waitForLogOutput('message B');

    const content = await fs.readFile(logFile, 'utf-8');
    expect(content).toContain('message A');
    expect(content).toContain('message B');
  });
});
