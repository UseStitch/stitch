import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAgentId, createAgentPermissionId } from '@openwork/shared';

import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));
const log = Log.create({ service: 'db' });

let _db: Db | undefined;

export function getDb(): Db {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export function initDb(): void {
  fs.mkdirSync(path.dirname(PATHS.filePaths.db), { recursive: true });

  const sqlite = new Database(PATHS.filePaths.db);
  sqlite.pragma('journal_mode = WAL');

  _db = drizzle(sqlite, { schema });

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

  log.info({ path: PATHS.filePaths.db }, 'database initialized');
}
