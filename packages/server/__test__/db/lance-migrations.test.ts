import * as lancedb from '@lancedb/lancedb';
import { Field, Int32, Schema, Utf8 } from 'apache-arrow';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { runPendingMigrations } from '@/db/lance-migrations.js';
import { migration0001AddPinnedColumn } from '@/db/lance-migrations/0001-add-pinned-column.js';
import { getConnection } from '@/memory/store/connection.js';

vi.mock('@/memory/store/connection.js', () => ({
  getConnection: vi.fn(),
}));

type MigrationRow = {
  version: number;
  id: string;
  prevId: string | null;
  name: string;
  checksum: string;
  status: 'applied' | 'failed';
  error: string | null;
  appliedAt: number;
};

function createMockDb(initialRows: MigrationRow[] = []) {
  const rows = new Map<number, MigrationRow>(initialRows.map((row) => [row.version, row]));

  return {
    db: {
      select: () => ({
        from: () => ({
          all: () => Array.from(rows.values()),
        }),
      }),
      insert: () => ({
        values: (value: MigrationRow) => ({
          onConflictDoUpdate: ({ set }: { set: Partial<MigrationRow> }) => ({
            run: () => {
              const existing = rows.get(value.version);
              if (existing) {
                rows.set(value.version, { ...existing, ...set });
                return;
              }

              rows.set(value.version, value);
            },
          }),
          run: () => {
            rows.set(value.version, value);
          },
        }),
      }),
    },
    rows,
  };
}

async function withTempWorkspace(fn: (ctx: { tempDir: string }) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-lance-migration-'));

  try {
    await fn({ tempDir });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createSemanticTable(
  tempDir: string,
  withPinned = false,
): Promise<lancedb.Connection> {
  const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));

  const fields: Field[] = [new Field('id', new Utf8(), false)];
  if (withPinned) {
    fields.push(new Field('pinned', new Int32(), false));
  }

  await connection.createEmptyTable('semantic_memories', new Schema(fields));
  return connection;
}

describe('runPendingMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('applies pending migration with real LanceDB and records success', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await createSemanticTable(tempDir);
      vi.mocked(getConnection).mockResolvedValue(connection as never);
      const { db, rows } = createMockDb();

      await runPendingMigrations(db as never);

      const row = rows.get(1);
      const checksum = row?.checksum;

      expect(row?.['status']).toBe('applied');
      expect(row?.['id']).toBe(migration0001AddPinnedColumn.id);
      expect(row?.['prevId']).toBe(migration0001AddPinnedColumn.prevId);
      expect(row?.['name']).toBe('add_pinned_column');
      expect(typeof checksum).toBe('string');
      expect(typeof checksum === 'string' && checksum.startsWith('sha256:')).toBe(true);

      const semanticTable = await connection.openTable('semantic_memories');
      const schema = await semanticTable.schema();
      expect(schema.fields.some((field) => field.name === 'pinned')).toBe(true);
    });
  });

  test('records applied when column already exists in real LanceDB schema', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await createSemanticTable(tempDir, true);
      vi.mocked(getConnection).mockResolvedValue(connection as never);
      const { db, rows } = createMockDb();

      await runPendingMigrations(db as never);
      await runPendingMigrations(db as never);

      expect(rows.size).toBe(1);
    });
  });

  test('fails fast on checksum mismatch', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));
      vi.mocked(getConnection).mockResolvedValue(connection as never);
      const { db } = createMockDb([
        {
          version: 1,
          id: migration0001AddPinnedColumn.id,
          prevId: migration0001AddPinnedColumn.prevId,
          name: 'add_pinned_column',
          checksum: 'sha256:old',
          status: 'applied',
          error: null,
          appliedAt: Date.now(),
        },
      ]);

      await expect(runPendingMigrations(db as never)).rejects.toThrow('checksum mismatch');
    });
  });

  test('fails fast on prevId mismatch', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));
      vi.mocked(getConnection).mockResolvedValue(connection as never);
      const { db } = createMockDb([
        {
          version: 1,
          id: migration0001AddPinnedColumn.id,
          prevId: 'wrong-prev-id',
          name: 'add_pinned_column',
          checksum: migration0001AddPinnedColumn.checksum,
          status: 'applied',
          error: null,
          appliedAt: Date.now(),
        },
      ]);

      await expect(runPendingMigrations(db as never)).rejects.toThrow('prevId mismatch');
    });
  });
});
