import {
  LanceMigrationChainBrokenError,
  LanceMigrationChecksumMismatchError,
  LanceMigrationDuplicateIdError,
  LanceMigrationDuplicateVersionError,
  LanceMigrationGapError,
  LanceMigrationRootError,
  LanceMigrationUnknownVersionError,
} from '@/db/errors.js';
import { MIGRATIONS } from '@/db/lance-migrations/manifest.js';
import type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';
import { lanceMigrations } from '@/db/schema/lance-migrations.js';
import * as Log from '@/lib/log.js';
import { getConnection as getConnectionDefault } from '@/memory/store/connection.js';
import type { getConnection as GetConnectionFn } from '@/memory/store/connection.js';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

const log = Log.create({ service: 'lance-migrations' });

type Db = BunSQLiteDatabase;

function ensureMigrationsAreValid(migrations: LanceMigrationDefinition[]): void {
  const versions = new Set<number>();
  const ids = new Set<string>();
  let previous: LanceMigrationDefinition | null = null;

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new LanceMigrationDuplicateVersionError(migration.version);
    }

    if (ids.has(migration.id)) {
      throw new LanceMigrationDuplicateIdError(migration.id);
    }

    if (previous) {
      if (migration.version !== previous.version + 1) {
        throw new LanceMigrationGapError(previous.version, migration.version);
      }

      if (migration.prevId !== previous.id) {
        throw new LanceMigrationChainBrokenError(migration.version, previous.id, migration.prevId);
      }
    } else if (migration.prevId !== null) {
      throw new LanceMigrationRootError(migration.version);
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
  existing: typeof lanceMigrations.$inferSelect | undefined,
  migration: LanceMigrationDefinition,
): void {
  if (!existing) return;

  if (existing.id && existing.id !== migration.id) {
    throw new LanceMigrationChecksumMismatchError(migration.version, migration.name, 'id', migration.id, existing.id);
  }

  if (existing.prevId !== null && existing.prevId !== migration.prevId) {
    throw new LanceMigrationChecksumMismatchError(
      migration.version,
      migration.name,
      'prevId',
      migration.prevId,
      existing.prevId,
    );
  }

  if (existing.checksum && existing.checksum !== migration.checksum) {
    throw new LanceMigrationChecksumMismatchError(
      migration.version,
      migration.name,
      'checksum',
      migration.checksum,
      existing.checksum,
    );
  }
}

export async function runPendingMigrations(db: Db, deps?: { getConnection?: typeof GetConnectionFn }): Promise<void> {
  const orderedMigrations = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  ensureMigrationsAreValid(orderedMigrations);

  if (orderedMigrations.length === 0) return;

  const existingRows = db.select().from(lanceMigrations).all();
  const existingByVersion = new Map(existingRows.map((row) => [row.version, row]));
  const definedVersions = new Set(orderedMigrations.map((m) => m.version));

  for (const row of existingRows) {
    if (row.status === 'applied' && !definedVersions.has(row.version)) {
      throw new LanceMigrationUnknownVersionError(row.version);
    }
  }

  const lanceDb = await (deps?.getConnection ?? getConnectionDefault)();
  const existingTables = new Set(await lanceDb.tableNames());

  for (const migration of orderedMigrations) {
    const existing = existingByVersion.get(migration.version);
    assertChecksumMatches(existing, migration);

    if (existing?.status === 'applied') {
      if (!existing.id || !existing.checksum || existing.prevId !== migration.prevId) {
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
