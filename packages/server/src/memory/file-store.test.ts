import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MemoryCapacityError, MemoryConflictError, MemoryFileStore, MemoryPathError } from '@/memory/file-store.js';

const roots: string[] = [];
const NOW = new Date('2026-08-04T12:00:00.000Z');

async function createStore(options: { memoryCharLimit?: number } = {}): Promise<MemoryFileStore> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'stitch-memory-'));
  roots.push(rootDir);
  return new MemoryFileStore({ rootDir, now: () => NOW, ...options });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('MemoryFileStore', () => {
  test('creates empty canonical files lazily', async () => {
    const store = await createStore();

    const snapshot = await store.readCurated('memory');

    expect(snapshot.rawContent).toBe('# Long-term memory\n');
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.capacity).toEqual({ used: 19, limit: 8_000, remaining: 7_981 });
    expect(await readFile(path.join(store.rootDir, 'USER.md'), 'utf8')).toBe('# User profile\n');
  });

  test('parses multiline entries and strips metadata from model content', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    await writeFile(
      path.join(store.rootDir, 'MEMORY.md'),
      '# Long-term memory\n\n<!-- stitch-memory id="mem_one" observed="2026-08-04" origin="user" source="ses_1" -->\n- Uses TypeScript.\n  Avoids JavaScript.\n',
    );

    const snapshot = await store.readCurated('memory');

    expect(snapshot.entries[0]).toMatchObject({
      id: 'mem_one',
      content: 'Uses TypeScript.\nAvoids JavaScript.',
      lineStart: 3,
      lineEnd: 5,
    });
    expect(snapshot.modelContent).not.toContain('stitch-memory');
    expect(snapshot.modelContent).toContain('- Uses TypeScript.');
  });

  test('preserves unmanaged Markdown during managed mutations', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    const manual = '# Long-term memory\n\nThis paragraph is managed by the user.\n';
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), manual);

    const added = await store.mutate('memory', [
      { type: 'add', content: 'The calendar uses Google.', source: 'ses_1' },
    ]);
    const replaced = await store.mutate(
      'memory',
      [{ type: 'replace', oldText: 'Google', content: 'Google Calendar' }],
      added.contentHash,
    );

    expect(replaced.rawContent).toStartWith(manual.trimEnd());
    expect(replaced.entries[0]?.content).toBe('The calendar uses Google Calendar.');
    expect(replaced.entries[0]?.id).toBe(added.entries[0]?.id);
  });

  test('rejects duplicate ids and malformed managed blocks', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    const block = '<!-- stitch-memory id="same" observed="2026-08-04" origin="user" source="ses_1" -->\n- One';
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), `# Long-term memory\n\n${block}\n\n${block}\n`);

    expect(store.readCurated('memory')).rejects.toBeInstanceOf(MemoryConflictError);

    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '# Long-term memory\n<!-- stitch-memory broken -->\n');
    expect(store.mutate('memory', [{ type: 'add', content: 'Safe' }])).rejects.toBeInstanceOf(MemoryConflictError);
  });

  test('rejects exact duplicates and ambiguous substring mutations', async () => {
    const store = await createStore();
    await store.mutate('memory', [
      { type: 'add', content: 'Uses Google Calendar.' },
      { type: 'add', content: 'Shares Google Drive files.' },
    ]);

    expect(store.mutate('memory', [{ type: 'add', content: 'Uses Google Calendar.' }])).rejects.toBeInstanceOf(
      MemoryConflictError,
    );
    expect(store.mutate('memory', [{ type: 'remove', oldText: 'Google' }])).rejects.toThrow(
      'oldText matches multiple memory entries',
    );
  });

  test('rolls back an overflowing atomic batch', async () => {
    const store = await createStore({ memoryCharLimit: 80 });
    const before = await store.readCurated('memory');

    expect(
      store.mutate('memory', [
        { type: 'add', content: 'Short durable fact.' },
        { type: 'add', content: 'x'.repeat(100) },
      ]),
    ).rejects.toBeInstanceOf(MemoryCapacityError);

    expect((await store.readCurated('memory')).contentHash).toBe(before.contentHash);
  });

  test('detects manual drift before writing', async () => {
    const store = await createStore();
    const before = await store.readCurated('memory');
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '# Long-term memory\n\nExternal edit.\n');

    expect(store.mutate('memory', [{ type: 'add', content: 'Would overwrite.' }], before.contentHash)).rejects.toThrow(
      'changed outside Stitch',
    );
    expect(await readFile(path.join(store.rootDir, 'MEMORY.md'), 'utf8')).toContain('External edit.');
  });

  test('serializes concurrent writes without losing entries', async () => {
    const store = await createStore();

    await Promise.all([
      store.mutate('memory', [{ type: 'add', content: 'First fact.' }]),
      store.mutate('memory', [{ type: 'add', content: 'Second fact.' }]),
    ]);

    expect((await store.readCurated('memory')).entries.map((entry) => entry.content).toSorted()).toEqual([
      'First fact.',
      'Second fact.',
    ]);
  });

  test('appends deduplicated candidates to dated daily files', async () => {
    const store = await createStore();

    const snapshot = await store.appendDaily([
      { content: 'Prefers concise replies.', origin: 'user', source: 'ses_1', target: 'user' },
      { content: 'Prefers concise replies.', origin: 'user', source: 'ses_1', target: 'user' },
    ]);

    expect(snapshot.name).toBe('daily/2026-08-04.md');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.target).toBe('user');
    expect(await store.listDailyFiles()).toEqual(['daily/2026-08-04.md']);
  });

  test('allows only canonical and dated memory paths', async () => {
    const store = await createStore();

    expect(store.readFile('../MEMORY.md')).rejects.toBeInstanceOf(MemoryPathError);
    expect(store.readFile('.state/consolidation.json')).rejects.toBeInstanceOf(MemoryPathError);
    expect(store.readFile('daily\\2026-08-04.md')).rejects.toThrow();
  });

  test('searches curated, daily, and unmanaged text without searching state', async () => {
    const store = await createStore();
    await store.mutate('memory', [{ type: 'add', content: 'The household calendar uses Google.' }]);
    await store.appendDaily([
      { content: 'The work calendar uses Outlook.', origin: 'user', source: 'ses_1', target: 'memory' },
    ]);
    const snapshot = await store.readCurated('user');
    await store.writeRaw('USER.md', `${snapshot.rawContent}\nManual calendar preference.\n`, snapshot.contentHash);

    const results = await store.search('calendar');

    expect(results.map((result) => result.filePath)).toEqual(['daily/2026-08-04.md', 'MEMORY.md', 'USER.md']);
    expect(results.some((result) => result.filePath.includes('.state'))).toBe(false);
  });

  test('returns bounded line excerpts with continuation metadata', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '# Long-term memory\none\ntwo\nthree\n');

    expect(await store.readLines('MEMORY.md', 2, 2)).toEqual({
      content: '2: one\n3: two',
      offset: 2,
      nextOffset: 4,
      truncated: true,
    });
  });
});
