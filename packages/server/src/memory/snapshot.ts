import { stat } from 'node:fs/promises';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { getMemoryConfig } from '@/memory/config.js';
import { memoryFileStore, type MemoryFileStore } from '@/memory/file-store.js';

const log = Log.create({ service: 'memory-snapshot' });

export type MemoryPromptContext = { userProfile: string | null; longTerm: string | null; truncated: boolean };

type CacheEntry = { mtimeMs: number; contentHash: string; content: string | null; truncated: boolean };
const cache = new Map<string, CacheEntry>();

async function readBounded(
  store: MemoryFileStore,
  target: 'memory' | 'user',
): Promise<{ content: string | null; truncated: boolean }> {
  const name = target === 'memory' ? 'MEMORY.md' : 'USER.md';
  const filePath = path.join(store.rootDir, name);
  const fileStat = await stat(filePath).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    await store.ensureInitialized();
    return stat(filePath);
  });
  const cached = cache.get(filePath);
  if (cached?.mtimeMs === fileStat.mtimeMs) return cached;

  const snapshot = await store.readCurated(target);
  const limit = target === 'memory' ? store.memoryCharLimit : store.userCharLimit;
  const truncated = snapshot.modelContent.length > limit;
  const visible = snapshot.modelContent.slice(0, limit).trim();
  const result = { content: visible || null, truncated };
  cache.set(filePath, { mtimeMs: fileStat.mtimeMs, contentHash: snapshot.contentHash, ...result });
  return result;
}

export async function readMemoryFilesForPrompt(store = memoryFileStore): Promise<MemoryPromptContext | null> {
  try {
    const [userProfile, longTerm] = await Promise.all([readBounded(store, 'user'), readBounded(store, 'memory')]);
    return {
      userProfile: userProfile.content,
      longTerm: longTerm.content,
      truncated: userProfile.truncated || longTerm.truncated,
    };
  } catch (error) {
    log.warn({ error }, 'failed to read memory files for prompt context');
    return null;
  }
}

export async function readMemoryPromptContext(store = memoryFileStore): Promise<MemoryPromptContext | null> {
  const config = await getMemoryConfig();
  return config.enabled ? readMemoryFilesForPrompt(store) : null;
}

export function clearMemorySnapshotCache(): void {
  cache.clear();
}
