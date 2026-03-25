import os from 'node:os';
import path from 'node:path';

const homedir = os.homedir();
const tmpdir = os.tmpdir();

function isSafeFilename(filename: string): boolean {
  const trimmed = filename.trim();
  return (
    trimmed !== '' &&
    trimmed !== '.' &&
    trimmed !== '..' &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('\0')
  );
}

function assertSafeFilename(filename: string): void {
  if (!isSafeFilename(filename)) {
    throw new Error(`Unsafe filename: ${JSON.stringify(filename)}`);
  }
}

type EnvPaths = {
  data: string;
  config: string;
  cache: string;
  log: string;
  temp: string;
};

function envPaths(name: string, { suffix = 'nodejs' } = {}): EnvPaths {
  assertSafeFilename(name);

  const fullName = suffix ? `${name}-${suffix}` : name;
  assertSafeFilename(fullName);

  if (process.platform === 'darwin') {
    const library = path.join(homedir, 'Library');
    return {
      data: path.join(library, 'Application Support', fullName),
      config: path.join(library, 'Preferences', fullName),
      cache: path.join(library, 'Caches', fullName),
      log: path.join(library, 'Logs', fullName),
      temp: path.join(tmpdir, fullName),
    };
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(homedir, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(homedir, 'AppData', 'Local');
    return {
      data: path.join(localAppData, fullName, 'Data'),
      config: path.join(appData, fullName, 'Config'),
      cache: path.join(localAppData, fullName, 'Cache'),
      log: path.join(localAppData, fullName, 'Log'),
      temp: path.join(tmpdir, fullName),
    };
  }

  // Linux / XDG
  const username = path.basename(homedir);
  return {
    data: path.join(process.env.XDG_DATA_HOME ?? path.join(homedir, '.local', 'share'), fullName),
    config: path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir, '.config'), fullName),
    cache: path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir, '.cache'), fullName),
    log: path.join(process.env.XDG_STATE_HOME ?? path.join(homedir, '.local', 'state'), fullName),
    temp: path.join(tmpdir, username, fullName),
  };
}

const isDev = process.env.NODE_ENV === 'development';
const APP_NAME = isDev ? 'stitch-dev' : 'stitch';
const paths = envPaths(APP_NAME, { suffix: '' });

export const PATHS = {
  configDir: paths.config,
  dataDir: paths.data,
  cacheDir: paths.cache,
  logDir: paths.log,

  filePaths: {
    db: path.join(paths.data, `${APP_NAME}.db`),
    models: path.join(paths.cache, 'models.json'),
  },

  dirPaths: {
    toolOutput: path.join(paths.data, 'tool-output'),
    providerLogos: path.join(paths.cache, 'provider-logos'),
    browserProfile: path.join(paths.data, 'browser-profile'),
  },
} as const;
