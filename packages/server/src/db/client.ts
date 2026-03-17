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

  const primaryAgents = _db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.type, 'primary'))
    .all();

  if (primaryAgents.length === 0) {
    const id = createAgentId();
    _db
      .insert(schema.agents)
      .values({
        id,
        name: 'My Assistant',
        type: 'primary',
      })
      .run();

    _db
      .insert(schema.agentPermissions)
      .values({
        id: createAgentPermissionId(),
        agentId: id,
        toolName: 'question',
        permission: 'allow',
        pattern: null,
      })
      .run();
  }

  log.info({ path: PATHS.filePaths.db, runtime: 'bun-sqlite' }, 'database initialized');
}
