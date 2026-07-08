import os from 'node:os';
import path from 'node:path';

const homedir = os.homedir();
const tmpdir = os.tmpdir();

type BaseDirs = { data: string; config: string; cache: string; log: string; temp: string };

type ServerPaths = {
  appName: string;
  configDir: string;
  dataDir: string;
  cacheDir: string;
  logDir: string;
  tempDir: string;
  filePaths: {
    db: string;
    mailDb: string;
    models: string;
    embeddingModelsRegistry: string;
    sttModelsRegistry: string;
    mcpRegistry: string;
  };
  dirPaths: {
    apps: string;
    mailbox: string;
    toolOutput: string;
    skills: string;
    providerLogos: string;
    mcpRegistryLogos: string;
    mcpIcons: string;
    connectorIcons: string;
    simpleIcons: string;
    recordings: string;
    mailAttachments: string;
  };
};

type CreatePathsOptions = {
  appName?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  tmpdir?: string;
};

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

function defaultAppName(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'test') return 'stitch-test';
  if (env.NODE_ENV === 'development') return 'stitch-dev';
  return 'stitch';
}

export function resolveAppName(options: Pick<CreatePathsOptions, 'appName' | 'env'> = {}): string {
  const env = options.env ?? process.env;
  const explicitAppName = options.appName?.trim();
  if (explicitAppName) {
    assertSafeFilename(explicitAppName);
    return explicitAppName;
  }

  const envAppName = env['STITCH_APP_NAME']?.trim();
  return envAppName && isSafeFilename(envAppName) ? envAppName : defaultAppName(env);
}

function getBaseDirs(options: {
  appName: string;
  platform: NodeJS.Platform;
  homedir: string;
  tmpdir: string;
  env: NodeJS.ProcessEnv;
}): BaseDirs {
  const { appName, platform, env } = options;
  assertSafeFilename(appName);

  if (platform === 'darwin') {
    const library = path.join(options.homedir, 'Library');
    return {
      data: path.join(library, 'Application Support', appName),
      config: path.join(library, 'Preferences', appName),
      cache: path.join(library, 'Caches', appName),
      log: path.join(library, 'Logs', appName),
      temp: path.join(options.tmpdir, appName),
    };
  }

  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.join(options.homedir, 'AppData', 'Roaming');
    const localAppData = env.LOCALAPPDATA ?? path.join(options.homedir, 'AppData', 'Local');
    return {
      data: path.join(localAppData, appName, 'Data'),
      config: path.join(appData, appName, 'Config'),
      cache: path.join(localAppData, appName, 'Cache'),
      log: path.join(localAppData, appName, 'Log'),
      temp: path.join(options.tmpdir, appName),
    };
  }

  const username = path.basename(options.homedir);
  return {
    data: path.join(env.XDG_DATA_HOME ?? path.join(options.homedir, '.local', 'share'), appName),
    config: path.join(env.XDG_CONFIG_HOME ?? path.join(options.homedir, '.config'), appName),
    cache: path.join(env.XDG_CACHE_HOME ?? path.join(options.homedir, '.cache'), appName),
    log: path.join(env.XDG_STATE_HOME ?? path.join(options.homedir, '.local', 'state'), appName),
    temp: path.join(options.tmpdir, username, appName),
  };
}

export function createPaths(options: CreatePathsOptions = {}): ServerPaths {
  const appName = resolveAppName(options);
  const paths = getBaseDirs({
    appName,
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
    homedir: options.homedir ?? homedir,
    tmpdir: options.tmpdir ?? tmpdir,
  });
  const appsDir = path.join(paths.data, 'apps');
  const mailboxDir = path.join(appsDir, 'mailbox');

  return {
    appName,
    configDir: paths.config,
    dataDir: paths.data,
    cacheDir: paths.cache,
    logDir: paths.log,
    tempDir: paths.temp,

    filePaths: {
      db: path.join(paths.data, `${appName}.db`),
      mailDb: path.join(mailboxDir, 'mail.db'),
      models: path.join(paths.cache, 'models.json'),
      embeddingModelsRegistry: path.join(paths.cache, 'embedding-models-registry.json'),
      sttModelsRegistry: path.join(paths.cache, 'stt-models-registry.json'),
      mcpRegistry: path.join(paths.cache, 'mcp-registry.json'),
    },

    dirPaths: {
      apps: appsDir,
      mailbox: mailboxDir,
      toolOutput: path.join(paths.data, 'tool-output'),
      skills: path.join(paths.data, 'skills'),
      providerLogos: path.join(paths.cache, 'provider-logos'),
      mcpRegistryLogos: path.join(paths.cache, 'mcp-registry-logos'),
      mcpIcons: path.join(paths.cache, 'mcp-icons'),
      connectorIcons: path.join(paths.cache, 'connector-icons'),
      simpleIcons: path.join(paths.cache, 'simple-icons'),
      recordings: path.join(paths.data, 'recordings'),
      mailAttachments: path.join(mailboxDir, 'attachments'),
    },
  };
}

export const PATHS = createPaths();
