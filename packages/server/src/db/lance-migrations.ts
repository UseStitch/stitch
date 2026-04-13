import { max } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import * as schema from '@/db/schema.js';
import { lanceMigrations } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { getConnection } from '@/memory/store/connection.js';
import type { Table as LanceTable } from '@lancedb/lancedb';

const log = Log.create({ service: 'lance-migrations' });

type Db = BunSQLiteDatabase<typeof schema>;

type LanceMigration = {
  version: number;
  name: string;
  tableName: string;
  up: (table: LanceTable) => Promise<void>;
};

// Central registry of all LanceDB table migrations, ordered by version.
const MIGRATIONS: LanceMigration[] = [
  {
    version: 1,
    name: 'add_pinned_column',
    tableName: 'semantic_memories',
    up: async (table) => {
      await table.addColumns([{ name: 'pinned', valueSql: '0' }]);
    },
  },
];

export async function runPendingMigrations(db: Db): Promise<void> {
  const result = db
    .select({ maxVersion: max(lanceMigrations.version) })
    .from(lanceMigrations)
    .get();
  const currentVersion = result?.maxVersion ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const lanceDb = await getConnection();
  const existingTables = new Set(await lanceDb.tableNames());

  for (const migration of pending) {
    // Skip if the target table doesn't exist yet — it will be created fresh with the current schema.
    if (!existingTables.has(migration.tableName)) {
      log.info(
        { version: migration.version, name: migration.name, tableName: migration.tableName },
        'skipping lance migration — table not yet created',
      );
      continue;
    }

    log.info({ version: migration.version, name: migration.name }, 'running lance migration');
    const table = await lanceDb.openTable(migration.tableName);
    await migration.up(table);
    db.insert(lanceMigrations)
      .values({ version: migration.version, name: migration.name, appliedAt: Date.now() })
      .run();
    log.info({ version: migration.version, name: migration.name }, 'lance migration applied');
  }
}
