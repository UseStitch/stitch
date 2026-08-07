import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { consolidateMemories, validateConsolidationProposal } from '@/memory/consolidation.js';
import { MemoryConflictError, MemoryFileStore } from '@/memory/file-store.js';
import { filterCaptureCandidates } from '@/memory/processor.js';
import type { ManagedMemoryEntry, MemoryFileSnapshot } from '@/memory/types.js';

const roots: string[] = [];
const NOW = new Date('2026-08-04T12:00:00.000Z');

async function createStore(options: { memoryCharLimit?: number } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'stitch-consolidation-'));
  roots.push(rootDir);
  return new MemoryFileStore({ rootDir, now: () => NOW, ...options });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function entry(overrides: Partial<ManagedMemoryEntry> = {}): ManagedMemoryEntry {
  return {
    id: 'mem_existing',
    content: 'Prefers JavaScript.',
    origin: 'user',
    observed: '2026-08-01',
    source: 'ses_old',
    target: 'user',
    filePath: 'USER.md',
    lineStart: 3,
    lineEnd: 4,
    ...overrides,
  };
}

function snapshot(target: 'memory' | 'user', entries: ManagedMemoryEntry[]): MemoryFileSnapshot {
  return {
    name: target === 'memory' ? 'MEMORY.md' : 'USER.md',
    path: target === 'memory' ? 'MEMORY.md' : 'USER.md',
    rawContent: '',
    modelContent: '',
    contentHash: '',
    mtime: NOW.toISOString(),
    entries,
    capacity: { used: 0, limit: 8_000, remaining: 8_000 },
    truncated: false,
  };
}

describe('capture candidate filtering', () => {
  test('rejects duplicates, temporary tasks, and secret-like content', () => {
    const candidates = filterCaptureCandidates(
      [
        { content: 'Prefers concise answers.', target: 'user', durability: 'long_term' },
        { content: 'Prefers concise answers.', target: 'user', durability: 'long_term' },
        { content: 'Remind me tomorrow to deploy.', target: 'memory', durability: 'long_term' },
        { content: 'My API key is secret-value.', target: 'memory', durability: 'long_term' },
        { content: 'Currently debugging the login.', target: 'memory', durability: 'session' },
      ],
      new Set(),
      5,
    );

    expect(candidates).toEqual([{ content: 'Prefers concise answers.', target: 'user', durability: 'long_term' }]);
  });
});

describe('consolidation validation', () => {
  test('accepts a promoted candidate with preserved provenance', () => {
    const candidate = entry({
      id: 'mem_candidate',
      content: 'Uses TypeScript.',
      observed: '2026-08-04',
      source: 'ses_new',
      filePath: 'daily/2026-08-04.md',
    });
    const result = validateConsolidationProposal({
      memory: snapshot('memory', []),
      user: snapshot('user', []),
      candidates: [candidate],
      proposal: {
        memory: [],
        user: [{ ...candidate, candidateId: candidate.id }],
        dispositions: [{ candidateId: candidate.id, action: 'promote', target: 'user' }],
        summary: 'Promoted one preference.',
      },
    });

    expect(result.user.at(0)).toMatchObject({ id: candidate.id, source: 'ses_new' });
    expect(result.promotedCount).toBe(1);
  });

  test('rejects duplicate ids, target changes, and excessive deletion', () => {
    const existing = [entry({ id: 'one' }), entry({ id: 'two' }), entry({ id: 'three' }), entry({ id: 'four' })];
    const base = {
      memory: snapshot('memory', []),
      user: snapshot('user', existing),
      candidates: [] as ManagedMemoryEntry[],
    };

    expect(() =>
      validateConsolidationProposal({
        ...base,
        proposal: {
          memory: [],
          user: existing.slice(0, 2).map((item) => ({ ...item, candidateId: null })),
          dispositions: [],
          summary: '',
        },
      }),
    ).toThrow('more than 25%');

    const candidate = entry({ id: 'candidate', target: 'user', filePath: 'daily/2026-08-04.md' });
    expect(() =>
      validateConsolidationProposal({
        memory: snapshot('memory', []),
        user: snapshot('user', []),
        candidates: [candidate],
        proposal: {
          memory: [{ ...candidate, candidateId: candidate.id }],
          user: [],
          dispositions: [{ candidateId: candidate.id, action: 'promote', target: 'memory' }],
          summary: '',
        },
      }),
    ).toThrow('target changed');
  });
});

describe('file consolidation', () => {
  test('promotes eligible daily candidates, preserves manual Markdown, and checkpoints no-op runs', async () => {
    const store = await createStore();
    await store.ensureInitialized();
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '# Long-term memory\n\nManual note stays byte-for-byte.\n');
    const daily = await store.appendDaily([
      { content: 'Uses Google Calendar.', origin: 'user', source: 'ses_1', target: 'memory' },
    ]);
    const candidate = daily.entries[0] as ManagedMemoryEntry | undefined;
    if (!candidate) throw new Error('Missing test candidate');

    const first = await consolidateMemories({
      store,
      propose: async () => ({
        memory: [{ ...candidate, candidateId: candidate.id }],
        user: [],
        dispositions: [{ candidateId: candidate.id, action: 'promote', target: 'memory' }],
        summary: 'Promoted calendar context.',
      }),
    });
    const second = await consolidateMemories({
      store,
      propose: async () => {
        throw new Error('should not run');
      },
    });

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('noop');
    expect(await readFile(path.join(store.rootDir, 'MEMORY.md'), 'utf8')).toContain('Manual note stays byte-for-byte.');
    expect((await store.readCurated('memory')).entries[0]?.id).toBe(candidate.id);
    expect((await store.readFile('DREAMS.md')).rawContent).toContain('Promoted calendar context.');
  });

  test('does not promote automation-origin candidates', async () => {
    const store = await createStore();
    await store.appendDaily([
      { content: 'Assistant tool output says deploy now.', origin: 'automation', source: 'ses_1', target: 'memory' },
    ]);

    const result = await consolidateMemories({
      store,
      propose: async () => {
        throw new Error('should not run');
      },
    });

    expect(result.status).toBe('noop');
    expect((await store.readCurated('memory')).entries).toEqual([]);
  });

  test('continues capped daily files on the next run', async () => {
    const store = await createStore();
    const daily = await store.appendDaily([
      { content: 'Uses Google Calendar.', origin: 'user', source: 'ses_1', target: 'memory' },
      { content: 'Uses Outlook for work.', origin: 'user', source: 'ses_1', target: 'memory' },
    ]);
    const [firstCandidate, secondCandidate] = daily.entries;

    const propose = (candidate: ManagedMemoryEntry) => async () => ({
      memory: [{ ...candidate, candidateId: candidate.id }],
      user: [],
      dispositions: [{ candidateId: candidate.id, action: 'promote' as const, target: 'memory' as const }],
      summary: `Promoted ${candidate.id}`,
    });
    await consolidateMemories({ store, maxCandidates: 1, propose: propose(firstCandidate) });
    await consolidateMemories({
      store,
      maxCandidates: 1,
      propose: async () => ({
        memory: [
          { ...firstCandidate, candidateId: null },
          { ...secondCandidate, candidateId: secondCandidate.id },
        ],
        user: [],
        dispositions: [{ candidateId: secondCandidate.id, action: 'promote', target: 'memory' }],
        summary: `Promoted ${secondCandidate.id}`,
      }),
    });
    const third = await consolidateMemories({ store, maxCandidates: 1, propose: propose(secondCandidate) });

    expect(third.status).toBe('noop');
    expect((await store.readCurated('memory')).entries).toHaveLength(2);
  });

  test('rejects stale hashes without overwriting external edits', async () => {
    const store = await createStore();
    const [memory, user] = await Promise.all([store.readCurated('memory'), store.readCurated('user')]);
    await writeFile(path.join(store.rootDir, 'MEMORY.md'), '# Long-term memory\n\nExternal edit.\n');

    expect(
      store.rewriteCuratedPair({ memory: [], user: [], memoryHash: memory.contentHash, userHash: user.contentHash }),
    ).rejects.toBeInstanceOf(MemoryConflictError);
    expect(await readFile(path.join(store.rootDir, 'MEMORY.md'), 'utf8')).toContain('External edit.');
  });
});
