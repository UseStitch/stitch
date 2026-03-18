import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import { createAgentId, createAgentPermissionId } from '@openwork/shared';

import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

type Db = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));
const log = Log.create({ service: 'db' });

let _db: Db | undefined;

function hasPrimaryAgents(db: Db): boolean {
  const primaryAgents = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.type, 'primary'))
    .all();

  return primaryAgents.length > 0;
}

function seedDb(db: Db): boolean {
  try {
    db.transaction((tx) => {
      const id = createAgentId();

      tx
        .insert(schema.agents)
        .values({
          id,
          name: 'My Assistant',
          type: 'primary',
        })
        .run();

      tx
        .insert(schema.agentPermissions)
        .values({
          id: createAgentPermissionId(),
          agentId: id,
          toolName: 'question',
          permission: 'allow',
          pattern: null,
        })
        .run();

      return true;
    });

    log.info('seeded initial database records');
    return true;
  } catch (error) {
    log.error({ error }, 'failed to seed initial database records');
    return false;
  }
}

export function getDb(): Db {
  if (!_db) throw new Error('Database not initialized - call initDb() first');
  return _db;
}

export async function initDb(): Promise<void> {
  fs.mkdirSync(path.dirname(PATHS.filePaths.db), { recursive: true });

  if (typeof Bun === 'undefined') {
    throw new Error('Bun runtime is required for SQLite initialization');
  }

  const [{ Database: BunDatabase }, { drizzle }, { migrate }] = await Promise.all([
    import('bun:sqlite'),
    import('drizzle-orm/bun-sqlite'),
    import('drizzle-orm/bun-sqlite/migrator'),
  ]);

  const sqlite = new BunDatabase(PATHS.filePaths.db, { create: true });
  sqlite.run('PRAGMA journal_mode = WAL');
  sqlite.run('PRAGMA synchronous = NORMAL');
  sqlite.run('PRAGMA busy_timeout = 5000');
  sqlite.run('PRAGMA foreign_keys = ON');

  _db = drizzle({ client: sqlite, schema }) as Db;
  migrate(_db, { migrationsFolder: MIGRATIONS_DIR });

  if (!hasPrimaryAgents(_db)) {
    const seeded = seedDb(_db);

    if (!seeded) {
      throw new Error('Database seeding failed');
    }
  }

  log.info({ path: PATHS.filePaths.db, runtime: 'bun-sqlite' }, 'database initialized');
}
