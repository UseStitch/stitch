import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpIcon } from '@stitch/shared/mcp/types';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'mcp-icons' });

type CachedIconFile = { key: string; mimeType: string; filePath: string };

const KEY_REGEX = /^[a-f0-9]{40}$/;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']);

function buildKey(scope: string, src: string): string {
  return createHash('sha256').update(`${scope}:${src}`).digest('hex').slice(0, 40);
}

function getIconFilePaths(key: string, cacheDir: string): { payload: string; metadata: string } {
  return { payload: path.join(cacheDir, `${key}.bin`), metadata: path.join(cacheDir, `${key}.json`) };
}

function normalizeMimeType(raw?: string): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.split(';').at(0)?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'image/jpg') return 'image/jpeg';
  return normalized;
}

function isAllowedRemoteIcon(iconUrl: URL, serverUrl: string): boolean {
  const serverOrigin = new URL(serverUrl).origin;
  return iconUrl.origin === serverOrigin;
}

async function writeCachedIcon(key: string, mimeType: string, bytes: Uint8Array, cacheDir: string): Promise<void> {
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
  if (!icon.src) return null;

  const key = buildKey(scope, icon.src);
  const existing = await readCachedIcon(key, cacheDir);
  if (existing) return { key };

  let iconUrl: URL;
  try {
    iconUrl = new URL(icon.src);
  } catch {
    return null;
  }

  const isDataUri = iconUrl.protocol === 'data:';
  if (!isDataUri && !['http:', 'https:'].includes(iconUrl.protocol)) return null;
  if (!isDataUri && !isAllowedRemoteIcon(iconUrl, serverUrl)) {
    log.warn({ serverUrl, iconUrl: iconUrl.toString() }, 'blocked mcp icon from non-matching origin');
    return null;
  }

  const response = await fetch(icon.src, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
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
