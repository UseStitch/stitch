import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { envPaths, isSafeFilename } from '@/lib/paths.js';

describe('isSafeFilename', () => {
  it('returns false for empty string', () => {
    expect(isSafeFilename('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isSafeFilename('   ')).toBe(false);
  });

  it('returns false for "."', () => {
    expect(isSafeFilename('.')).toBe(false);
  });

  it('returns false for ".."', () => {
    expect(isSafeFilename('..')).toBe(false);
  });

  it('returns false for string containing forward slash', () => {
    expect(isSafeFilename('foo/bar')).toBe(false);
  });

  it('returns false for string containing backslash', () => {
    expect(isSafeFilename('foo\\bar')).toBe(false);
  });

  it('returns false for string containing null byte', () => {
    expect(isSafeFilename('foo\0bar')).toBe(false);
  });

  it('returns true for a normal filename', () => {
    expect(isSafeFilename('openwork')).toBe(true);
  });
});

describe('envPaths', () => {
  it('throws for an unsafe name', () => {
    expect(() => envPaths('../escape')).toThrow('Unsafe filename');
  });

  it('appends suffix to the directory name by default', () => {
    const result = envPaths('myapp');
    expect(result.data).toContain('myapp-nodejs');
  });

  it('uses the name as-is when suffix is empty', () => {
    const result = envPaths('myapp', { suffix: '' });
    expect(result.data).toContain('myapp');
    expect(result.data).not.toContain('myapp-');
  });

  it('uses a custom suffix when provided', () => {
    const result = envPaths('myapp', { suffix: 'custom' });
    expect(result.data).toContain('myapp-custom');
  });

  describe('macOS paths', () => {
    it('returns Library-based paths on darwin', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const result = envPaths('myapp', { suffix: '' });

      expect(result.data).toContain(path.join('Library', 'Application Support', 'myapp'));
      expect(result.config).toContain(path.join('Library', 'Preferences', 'myapp'));
      expect(result.cache).toContain(path.join('Library', 'Caches', 'myapp'));
      expect(result.log).toContain(path.join('Library', 'Logs', 'myapp'));

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('Windows paths', () => {
    it('uses APPDATA and LOCALAPPDATA env vars when set', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const originalAppData = process.env.APPDATA;
      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.APPDATA = 'C:\\AppData\\Roaming';
      process.env.LOCALAPPDATA = 'C:\\AppData\\Local';

      const result = envPaths('myapp', { suffix: '' });

      expect(result.config).toBe(path.join('C:\\AppData\\Roaming', 'myapp', 'Config'));
      expect(result.data).toBe(path.join('C:\\AppData\\Local', 'myapp', 'Data'));
      expect(result.cache).toBe(path.join('C:\\AppData\\Local', 'myapp', 'Cache'));
      expect(result.log).toBe(path.join('C:\\AppData\\Local', 'myapp', 'Log'));

      process.env.APPDATA = originalAppData;
      process.env.LOCALAPPDATA = originalLocalAppData;
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('falls back to ~/AppData paths when env vars are absent', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const originalAppData = process.env.APPDATA;
      const originalLocalAppData = process.env.LOCALAPPDATA;
      delete process.env.APPDATA;
      delete process.env.LOCALAPPDATA;

      const result = envPaths('myapp', { suffix: '' });

      expect(result.config).toContain(path.join('AppData', 'Roaming', 'myapp', 'Config'));
      expect(result.data).toContain(path.join('AppData', 'Local', 'myapp', 'Data'));

      process.env.APPDATA = originalAppData;
      process.env.LOCALAPPDATA = originalLocalAppData;
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('Linux/XDG paths', () => {
    it('uses XDG env vars when set', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      process.env.XDG_DATA_HOME = '/custom/data';
      process.env.XDG_CONFIG_HOME = '/custom/config';
      process.env.XDG_CACHE_HOME = '/custom/cache';
      process.env.XDG_STATE_HOME = '/custom/state';

      const result = envPaths('myapp', { suffix: '' });

      expect(result.data).toBe(path.join('/custom/data', 'myapp'));
      expect(result.config).toBe(path.join('/custom/config', 'myapp'));
      expect(result.cache).toBe(path.join('/custom/cache', 'myapp'));
      expect(result.log).toBe(path.join('/custom/state', 'myapp'));

      delete process.env.XDG_DATA_HOME;
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_CACHE_HOME;
      delete process.env.XDG_STATE_HOME;
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('falls back to ~/.local/share and ~/.config when XDG vars are absent', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      delete process.env.XDG_DATA_HOME;
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_CACHE_HOME;
      delete process.env.XDG_STATE_HOME;

      const result = envPaths('myapp', { suffix: '' });

      expect(result.data).toContain(path.join('.local', 'share', 'myapp'));
      expect(result.config).toContain(path.join('.config', 'myapp'));
      expect(result.cache).toContain(path.join('.cache', 'myapp'));
      expect(result.log).toContain(path.join('.local', 'state', 'myapp'));

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
