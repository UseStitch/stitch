import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import { MIGRATIONS } from '@/db/lance-migrations/manifest.js';
import type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';
import * as schema from '@/db/schema.js';
import { lanceMigrations } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { getConnection } from '@/memory/store/connection.js';

const log = Log.create({ service: 'lance-migrations' });

type Db = BunSQLiteDatabase<typeof schema>;

function ensureMigrationsAreValid(migrations: LanceMigrationDefinition[]): void {
  const versions = new Set<number>();
  const ids = new Set<string>();
  let previous: LanceMigrationDefinition | null = null;

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate Lance migration version: ${migration.version}`);
    }

    if (ids.has(migration.id)) {
      throw new Error(`Duplicate Lance migration id: ${migration.id}`);
    }

    if (previous) {
      if (migration.version !== previous.version + 1) {
        throw new Error(
          `Lance migration version gap detected between v${previous.version} and v${migration.version}`,
        );
      }

      if (migration.prevId !== previous.id) {
        throw new Error(
          `Lance migration chain broken at v${migration.version}: expected prevId ${previous.id}, found ${migration.prevId}`,
        );
      }
    } else if (migration.prevId !== null) {
      throw new Error(`First Lance migration must have prevId=null (v${migration.version})`);
    }

    versions.add(migration.version);
    ids.add(migration.id);
    previous = migration;
  }
}

async function markApplied(db: Db, migration: LanceMigrationDefinition): Promise<void> {
  db.insert(lanceMigrations)
    .values({
      version: migration.version,
      id: migration.id,
      prevId: migration.prevId,
      name: migration.name,
      checksum: migration.checksum,
      status: 'applied',
      error: null,
      appliedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: lanceMigrations.version,
      set: {
        id: migration.id,
        prevId: migration.prevId,
        name: migration.name,
        checksum: migration.checksum,
        status: 'applied',
        error: null,
      },
    })
    .run();
}

function assertChecksumMatches(
  existing: (typeof lanceMigrations.$inferSelect) | undefined,
  migration: LanceMigrationDefinition,
): void {
  if (!existing) return;

  if (existing.id && existing.id !== migration.id) {
    throw new Error(
      `Lance migration id mismatch for v${migration.version} (${migration.name}). ` +
        `Expected ${migration.id}, found ${existing.id}.`,
    );
  }

  if (existing.prevId !== null && existing.prevId !== migration.prevId) {
    throw new Error(
      `Lance migration prevId mismatch for v${migration.version} (${migration.name}). ` +
        `Expected ${migration.prevId}, found ${existing.prevId}.`,
    );
  }

  if (existing.checksum && existing.checksum !== migration.checksum) {
    throw new Error(
      `Lance migration checksum mismatch for v${migration.version} (${migration.name}). ` +
        `Expected ${migration.checksum}, found ${existing.checksum}. ` +
        'This usually means an already-applied migration file was edited.',
    );
  }
}

export async function runPendingMigrations(db: Db): Promise<void> {
  const orderedMigrations = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  ensureMigrationsAreValid(orderedMigrations);

  if (orderedMigrations.length === 0) return;

  const existingRows = db.select().from(lanceMigrations).all();
  const existingByVersion = new Map(existingRows.map((row) => [row.version, row]));
  const definedVersions = new Set(orderedMigrations.map((m) => m.version));

  for (const row of existingRows) {
    if (row.status === 'applied' && !definedVersions.has(row.version)) {
      throw new Error(
        `Lance migration history contains unknown applied version: v${row.version}. ` +
          'Migration files may be missing or reordered.',
      );
    }
  }

  const lanceDb = await getConnection();
  const existingTables = new Set(await lanceDb.tableNames());

  for (const migration of orderedMigrations) {
    const existing = existingByVersion.get(migration.version);
    assertChecksumMatches(existing, migration);

    if (existing?.status === 'applied') {
      if (
        !existing.id ||
        !existing.checksum ||
        existing.prevId !== migration.prevId
      ) {
        await markApplied(db, migration);
      }
      continue;
    }

    log.info({ version: migration.version, name: migration.name }, 'running lance migration');

    if (!existingTables.has(migration.tableName)) {
      log.info(
        { version: migration.version, name: migration.name, tableName: migration.tableName },
        'skipping lance migration — table not yet created',
      );
      await markApplied(db, migration);
      continue;
    }

    const table = await lanceDb.openTable(migration.tableName);

    if (migration.isApplied && (await migration.isApplied(table))) {
      log.info(
        { version: migration.version, name: migration.name, tableName: migration.tableName },
        'lance migration already applied; recording version',
      );
      await markApplied(db, migration);
      continue;
    }

    try {
      await migration.up(table);
      await markApplied(db, migration);
      log.info({ version: migration.version, name: migration.name }, 'lance migration applied');
    } catch (error) {
      db.insert(lanceMigrations)
        .values({
          version: migration.version,
          id: migration.id,
          prevId: migration.prevId,
          name: migration.name,
          checksum: migration.checksum,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          appliedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: lanceMigrations.version,
          set: {
            id: migration.id,
            prevId: migration.prevId,
            name: migration.name,
            checksum: migration.checksum,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .run();

      throw error;
    }

  }
}
