import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import { createPaths, resolveAppName } from '@/lib/paths.js';

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe('resolveAppName', () => {
  test('uses stitch in production-like environments', () => {
    expect(resolveAppName({ env: EMPTY_ENV })).toBe('stitch');
  });

  test('uses stitch-dev in development', () => {
    expect(resolveAppName({ env: { NODE_ENV: 'development' } })).toBe('stitch-dev');
  });

  test('uses stitch-test in tests', () => {
    expect(resolveAppName({ env: { NODE_ENV: 'test' } })).toBe('stitch-test');
  });

  test('uses safe STITCH_APP_NAME over environment defaults', () => {
    expect(resolveAppName({ env: { NODE_ENV: 'test', STITCH_APP_NAME: 'custom-app' } })).toBe('custom-app');
  });

  test('falls back when STITCH_APP_NAME is unsafe', () => {
    expect(resolveAppName({ env: { NODE_ENV: 'test', STITCH_APP_NAME: '../stitch' } })).toBe('stitch-test');
  });

  test('explicit appName overrides environment app name', () => {
    expect(resolveAppName({ appName: 'explicit-app', env: { STITCH_APP_NAME: 'env-app' } })).toBe('explicit-app');
  });

  test('rejects unsafe explicit appName', () => {
    expect(() => resolveAppName({ appName: 'bad/name', env: EMPTY_ENV })).toThrow('Unsafe filename');
  });
});

describe('createPaths', () => {
  test('creates Windows paths with the resolved app name', () => {
    const paths = createPaths({
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
      platform: 'win32',
      homedir: 'C:\\Users\\test',
      tmpdir: 'C:\\Users\\test\\AppData\\Local\\Temp',
      appName: 'stitch-custom',
    });

    expect(paths.appName).toBe('stitch-custom');
    expect(paths.dataDir).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'stitch-custom', 'Data'));
    expect(paths.configDir).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'stitch-custom', 'Config'));
    expect(paths.logDir).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'stitch-custom', 'Log'));
    expect(paths.filePaths.db).toBe(path.join(paths.dataDir, 'stitch-custom.db'));
    expect(paths.dirPaths.apps).toBe(path.join(paths.dataDir, 'apps'));
    expect(paths.dirPaths.mailbox).toBe(path.join(paths.dirPaths.apps, 'mailbox'));
    expect(paths.filePaths.mailDb).toBe(path.join(paths.dirPaths.mailbox, 'mail.db'));
    expect(paths.dirPaths.mailAttachments).toBe(path.join(paths.dirPaths.mailbox, 'attachments'));
    expect(paths.dirPaths.recordings).toBe(path.join(paths.dataDir, 'recordings'));
  });

  test('keeps test paths isolated from production paths', () => {
    const paths = createPaths({
      env: { NODE_ENV: 'test' },
      platform: 'linux',
      homedir: '/home/tester',
      tmpdir: '/tmp',
    });

    expect(paths.appName).toBe('stitch-test');
    expect(paths.logDir).toBe(path.join('/home/tester/.local/state', 'stitch-test'));
    expect(paths.filePaths.db).toBe(path.join(paths.dataDir, 'stitch-test.db'));
  });

  test('uses XDG directories on Linux when provided', () => {
    const paths = createPaths({
      env: {
        XDG_DATA_HOME: '/xdg/data',
        XDG_CONFIG_HOME: '/xdg/config',
        XDG_CACHE_HOME: '/xdg/cache',
        XDG_STATE_HOME: '/xdg/state',
      },
      platform: 'linux',
      homedir: '/home/tester',
      tmpdir: '/tmp',
      appName: 'stitch-custom',
    });

    expect(paths.dataDir).toBe(path.join('/xdg/data', 'stitch-custom'));
    expect(paths.configDir).toBe(path.join('/xdg/config', 'stitch-custom'));
    expect(paths.cacheDir).toBe(path.join('/xdg/cache', 'stitch-custom'));
    expect(paths.logDir).toBe(path.join('/xdg/state', 'stitch-custom'));
    expect(paths.tempDir).toBe(path.join('/tmp', 'tester', 'stitch-custom'));
  });

  test('creates macOS paths with the resolved app name', () => {
    const paths = createPaths({
      env: EMPTY_ENV,
      platform: 'darwin',
      homedir: '/Users/tester',
      tmpdir: '/var/folders/tmp',
      appName: 'stitch-custom',
    });

    expect(paths.dataDir).toBe(path.join('/Users/tester', 'Library', 'Application Support', 'stitch-custom'));
    expect(paths.configDir).toBe(path.join('/Users/tester', 'Library', 'Preferences', 'stitch-custom'));
    expect(paths.cacheDir).toBe(path.join('/Users/tester', 'Library', 'Caches', 'stitch-custom'));
    expect(paths.logDir).toBe(path.join('/Users/tester', 'Library', 'Logs', 'stitch-custom'));
    expect(paths.tempDir).toBe(path.join('/var/folders/tmp', 'stitch-custom'));
  });
});
