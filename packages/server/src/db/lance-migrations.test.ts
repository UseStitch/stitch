import * as lancedb from '@lancedb/lancedb';
import { Field, Int32, Schema, Utf8 } from 'apache-arrow';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';

import { runPendingMigrations } from '@/db/lance-migrations.js';
import { migration0001AddPinnedColumn } from '@/db/lance-migrations/0001-add-pinned-column.js';
import { getDb } from '@/db/client.js';
import { setupTestDb } from '@/db/test-helpers.js';

setupTestDb();

async function withTempWorkspace(fn: (ctx: { tempDir: string }) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-lance-migration-'));
  try {
    await fn({ tempDir });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createSemanticTable(tempDir: string, withPinned = false): Promise<lancedb.Connection> {
  const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));
  const fields: Field[] = [new Field('id', new Utf8(), false)];
  if (withPinned) fields.push(new Field('pinned', new Int32(), false));
  await connection.createEmptyTable('semantic_memories', new Schema(fields));
  return connection;
}

describe('runPendingMigrations', () => {
  test('applies pending migration with real LanceDB and records success', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await createSemanticTable(tempDir);
      const db = getDb();

      await runPendingMigrations(db, { getConnection: async () => connection as never });

      const semanticTable = await connection.openTable('semantic_memories');
      const schema = await semanticTable.schema();
      expect(schema.fields.some((f) => f.name === 'pinned')).toBe(true);

      // Check the migration row recorded in SQLite
      const { lanceMigrations } = await import('@/db/schema.js');
      const rows = db.select().from(lanceMigrations).all();
      const row = rows.find((r) => r.version === 1);
      expect(row?.status).toBe('applied');
      expect(row?.id).toBe(migration0001AddPinnedColumn.id);
      expect(row?.prevId).toBe(migration0001AddPinnedColumn.prevId);
      expect(row?.name).toBe('add_pinned_column');
      expect(typeof row?.checksum).toBe('string');
      expect(row?.checksum?.startsWith('sha256:')).toBe(true);
    });
  });

  test('records applied when column already exists in real LanceDB schema', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await createSemanticTable(tempDir, true);
      const db = getDb();

      await runPendingMigrations(db, { getConnection: async () => connection as never });
      await runPendingMigrations(db, { getConnection: async () => connection as never });

      const { lanceMigrations } = await import('@/db/schema.js');
      const rows = db.select().from(lanceMigrations).all();
      expect(rows).toHaveLength(1);
    });
  });

  test('fails fast on checksum mismatch', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));
      const db = getDb();

      // Pre-seed migration row with wrong checksum
      const { lanceMigrations } = await import('@/db/schema.js');
      db.insert(lanceMigrations).values({
        version: 1,
        id: migration0001AddPinnedColumn.id,
        prevId: migration0001AddPinnedColumn.prevId,
        name: 'add_pinned_column',
        checksum: 'sha256:old',
        status: 'applied',
        error: null,
        appliedAt: Date.now(),
      }).run();

      let threw = false;
      try {
        await runPendingMigrations(db, { getConnection: async () => connection as never });
      } catch (e) {
        threw = true;
        expect(e instanceof Error && e.message.includes('checksum mismatch')).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });

  test('fails fast on prevId mismatch', async () => {
    await withTempWorkspace(async ({ tempDir }) => {
      const connection = await lancedb.connect(path.join(tempDir, 'memory.lance'));
      const db = getDb();

      const { lanceMigrations } = await import('@/db/schema.js');
      db.insert(lanceMigrations).values({
        version: 1,
        id: migration0001AddPinnedColumn.id,
        prevId: 'wrong-prev-id',
        name: 'add_pinned_column',
        checksum: migration0001AddPinnedColumn.checksum,
        status: 'applied',
        error: null,
        appliedAt: Date.now(),
      }).run();

      let threw = false;
      try {
        await runPendingMigrations(db, { getConnection: async () => connection as never });
      } catch (e) {
        threw = true;
        expect(e instanceof Error && e.message.includes('prevId mismatch')).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });
});
