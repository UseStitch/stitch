import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SETTINGS_DEFAULTS } from '@stitch/shared/settings/types';
import { SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

type Db = BetterSQLite3Database<typeof schema>;

const log = Log.create({ service: 'db' });

let _db: Db | undefined;
let _sqlite: import('better-sqlite3').Database | undefined;

function getDatabasePath(): string {
  return process.env['STITCH_DB_PATH']?.trim() || PATHS.filePaths.db;
}

function getMigrationsDir(): string {
  if (process.env.NODE_ENV === 'development') {
    const sourceMigrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));
    if (fs.existsSync(sourceMigrationsDir)) {
      log.info(
        { migrationsDir: sourceMigrationsDir, execPath: process.execPath },
        'migrations dir resolved (dev)',
      );
      return sourceMigrationsDir;
    }
  }

  const serverDir = process.env['STITCH_SERVER_DIR'] ?? path.dirname(process.execPath);
  const migrationsDir = path.join(serverDir, 'drizzle');
  log.info({ migrationsDir, serverDir }, 'migrations dir resolved');
  return migrationsDir;
}

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

export function isDbInitialized(): boolean {
  return _db !== undefined;
}

export async function initDb(): Promise<void> {
  const dbPath = getDatabasePath();
  const migrationsDir = getMigrationsDir();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('PRAGMA foreign_keys = ON');

  _sqlite = sqlite;
  _db = drizzle({ client: sqlite, schema }) as Db;
  migrate(_db, { migrationsFolder: migrationsDir });

  seedShortcuts(_db);
  seedSettings(_db);

  log.info({ path: dbPath, migrationsDir, runtime: 'better-sqlite3' }, 'database initialized');
}

export function closeDb(): void {
  if (!_sqlite) return;

  try {
    _sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // best-effort WAL checkpoint
  }

  try {
    _sqlite.close();
  } catch {
    // best-effort close
  }

  _sqlite = undefined;
  _db = undefined;
  log.info('database closed');
}
