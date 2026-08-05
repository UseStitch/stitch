import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MemoryFileStore } from '@/memory/file-store.js';
import { clearMemorySnapshotCache, readMemoryFilesForPrompt } from '@/memory/snapshot.js';

const roots: string[] = [];

async function createStore(limits: { memoryCharLimit?: number; userCharLimit?: number } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'stitch-memory-snapshot-'));
  roots.push(rootDir);
  return new MemoryFileStore({ rootDir, ...limits });
}

afterEach(async () => {
  clearMemorySnapshotCache();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('readMemoryFilesForPrompt', () => {
  test('reads user profile before long-term memory and removes metadata', async () => {
    const store = await createStore();
    await store.mutate('user', [{ type: 'add', content: 'Prefer concise replies.' }]);
    await store.mutate('memory', [{ type: 'add', content: 'Uses Google Calendar.' }]);

    const context = await readMemoryFilesForPrompt(store);

    expect(context?.userProfile).toContain('Prefer concise replies.');
    expect(context?.longTerm).toContain('Uses Google Calendar.');
    expect(context?.userProfile).not.toContain('stitch-memory');
  });

  test('bounds injected content without truncating the file', async () => {
    const store = await createStore({ memoryCharLimit: 30 });
    await store.ensureInitialized();
    const raw = `# Long-term memory\n\n${'x'.repeat(100)}\n`;
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), raw);

    const context = await readMemoryFilesForPrompt(store);

    expect(context?.longTerm).toHaveLength(30);
    expect(context?.truncated).toBe(true);
    expect((await store.readCurated('memory')).rawContent).toBe(raw);
  });

  test('refreshes after an external file edit', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    await readMemoryFilesForPrompt(store);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(path.join(store.rootDir, 'USER.md'), '# User profile\n\nExternal preference.\n');

    const context = await readMemoryFilesForPrompt(store);

    expect(context?.userProfile).toContain('External preference.');
  });

  test('degrades to no context when a curated file is malformed', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '<!-- stitch-memory malformed -->\n');

    expect(await readMemoryFilesForPrompt(store)).toBeNull();
  });
});
