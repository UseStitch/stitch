import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ServerMode = 'local' | 'remote';

export type ServerConnectionConfig = { mode: ServerMode; remoteUrl: string | null };

const CONFIG_FILE_NAME = 'server-config.json';

const DEFAULT_CONFIG: ServerConnectionConfig = { mode: 'local', remoteUrl: null };

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function parseConfig(raw: string): ServerConnectionConfig {
  const parsed = JSON.parse(raw) as Partial<ServerConnectionConfig>;
  const mode = parsed.mode === 'remote' ? 'remote' : 'local';
  const remoteUrl = typeof parsed.remoteUrl === 'string' ? parsed.remoteUrl : null;
  return { mode, remoteUrl };
}

export function normalizeRemoteUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('Remote server URL is required');
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Remote server URL must use http or https');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

export async function readServerConnectionConfig(): Promise<ServerConnectionConfig> {
  try {
    return parseConfig(await readFile(getConfigPath(), 'utf-8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function writeServerConnectionConfig(config: ServerConnectionConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
