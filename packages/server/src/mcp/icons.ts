import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpIcon } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'mcp-icons' });

type CachedIconFile = {
  key: string;
  mimeType: string;
  filePath: string;
};

const KEY_REGEX = /^[a-f0-9]{40}$/;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']);

function buildKey(scope: string, src: string): string {
  return createHash('sha256').update(`${scope}:${src}`).digest('hex').slice(0, 40);
}

function getIconFilePaths(key: string, cacheDir: string): { payload: string; metadata: string } {
  return {
    payload: path.join(cacheDir, `${key}.bin`),
    metadata: path.join(cacheDir, `${key}.json`),
  };
}

function parseDataUri(uri: string): { mimeType: string; data: Uint8Array } | null {
  if (!uri.startsWith('data:')) return null;
  const commaIndex = uri.indexOf(',');
  if (commaIndex < 0) return null;

  const header = uri.slice(5, commaIndex);
  const dataPart = uri.slice(commaIndex + 1);
  const parts = header.split(';').map((part) => part.trim().toLowerCase());
  const mimeType = parts[0] || 'text/plain';
  const isBase64 = parts.includes('base64');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return null;

  try {
    if (isBase64) {
      return { mimeType, data: Buffer.from(dataPart, 'base64') };
    }
    return { mimeType, data: Buffer.from(decodeURIComponent(dataPart), 'utf8') };
  } catch {
    return null;
  }
}

function normalizeMimeType(raw?: string): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.split(';')[0]?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'image/jpg') return 'image/jpeg';
  return normalized;
}

function isAllowedRemoteIcon(iconUrl: URL, serverUrl: string): boolean {
  const serverOrigin = new URL(serverUrl).origin;
  return iconUrl.origin === serverOrigin;
}

async function writeCachedIcon(
  key: string,
  mimeType: string,
  bytes: Uint8Array,
  cacheDir: string,
): Promise<void> {
  const { payload, metadata } = getIconFilePaths(key, cacheDir);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(payload, bytes);
  await fs.writeFile(metadata, JSON.stringify({ mimeType }), 'utf8');
}

async function readCachedIcon(key: string, cacheDir: string): Promise<CachedIconFile | null> {
  if (!KEY_REGEX.test(key)) return null;

  const { payload, metadata } = getIconFilePaths(key, cacheDir);
  const [iconBuffer, metadataText] = await Promise.all([
    fs.readFile(payload).catch(() => null),
    fs.readFile(metadata, 'utf8').catch(() => null),
  ]);
  if (!iconBuffer || !metadataText) return null;

  try {
    const parsed = JSON.parse(metadataText) as { mimeType?: string };
    const mimeType = normalizeMimeType(parsed.mimeType) ?? 'application/octet-stream';
    return { key, mimeType, filePath: payload };
  } catch {
    return null;
  }
}

export async function cacheMcpIcon(input: {
  serverUrl: string;
  scope: string;
  icon: McpIcon;
  cacheDir?: string;
}): Promise<{ key: string } | null> {
  const { serverUrl, scope, icon } = input;
  const cacheDir = input.cacheDir ?? PATHS.dirPaths.mcpIcons;
  if (!icon?.src) return null;

  const key = buildKey(scope, icon.src);
  const existing = await readCachedIcon(key, cacheDir);
  if (existing) return { key };

  const dataUri = parseDataUri(icon.src);
  if (dataUri) {
    await writeCachedIcon(key, dataUri.mimeType, dataUri.data, cacheDir);
    return { key };
  }

  let iconUrl: URL;
  try {
    iconUrl = new URL(icon.src);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(iconUrl.protocol)) return null;
  if (!isAllowedRemoteIcon(iconUrl, serverUrl)) {
    log.warn({ serverUrl, iconUrl: iconUrl.toString() }, 'blocked mcp icon from non-matching origin');
    return null;
  }

  const response = await fetch(iconUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response || !response.ok) return null;

  const headerType = normalizeMimeType(response.headers.get('content-type') ?? undefined);
  const declaredType = normalizeMimeType(icon.mimeType);
  const mimeType = declaredType ?? headerType;
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeCachedIcon(key, mimeType, bytes, cacheDir);
  return { key };
}

export async function getMcpIconByKey(
  key: string,
  options: { cacheDir?: string } = {},
): Promise<{ mimeType: string; body: Uint8Array } | null> {
  const cacheDir = options.cacheDir ?? PATHS.dirPaths.mcpIcons;
  const cached = await readCachedIcon(key, cacheDir);
  if (!cached) return null;

  const body = await fs.readFile(cached.filePath).catch(() => null);
  if (!body) return null;
  return { mimeType: cached.mimeType, body: new Uint8Array(body) };
}
