import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SETTINGS_DEFAULTS } from '@stitch/shared/settings/types';
import { SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import { seedBrowserAgent } from '@/agents/builtins/browser.js';
import { seedMeetingsAgent } from '@/agents/builtins/meetings.js';
import { seedPrimaryAgent } from '@/agents/builtins/primary.js';
import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export type Db = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));
const log = Log.create({ service: 'db' });

let _db: Db | undefined;

function seedShortcuts(db: Db): void {
  for (const def of SHORTCUT_DEFAULTS) {
    db.insert(schema.keyboardShortcuts)
      .values({
        actionId: def.actionId,
        hotkey: def.hotkey,
        isSequence: def.isSequence,
        label: def.label,
        category: def.category,
      })
      .onConflictDoNothing()
      .run();
  }
}

function seedSettings(db: Db): void {
  for (const def of SETTINGS_DEFAULTS) {
    db.insert(schema.userSettings)
      .values({
        key: def.key,
        value: def.value,
        description: def.description,
      })
      .onConflictDoUpdate({
        target: schema.userSettings.key,
        set: { description: def.description },
      })
      .run();
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

  seedPrimaryAgent(_db);
  seedShortcuts(_db);
  seedSettings(_db);
  seedMeetingsAgent(_db);
  seedBrowserAgent(_db);

  log.info({ path: PATHS.filePaths.db, runtime: 'bun-sqlite' }, 'database initialized');
}
