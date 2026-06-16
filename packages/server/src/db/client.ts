import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SETTINGS_DEFAULTS } from '@stitch/shared/settings/types';
import { SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import { keyboardShortcuts, userSettings } from '@/db/schema/settings.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { seedMeetingNoteTemplates } from '@/recordings/meeting-note-templates.js';
import type { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

type Db = BunSQLiteDatabase;

const log = Log.create({ service: 'db' });

let _db: Db | undefined;
let _sqlite: Database | undefined;

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

  const migrationsDir = path.join(path.dirname(process.execPath), 'drizzle');
  log.info({ migrationsDir, execPath: process.execPath }, 'migrations dir resolved');
  return migrationsDir;
}

function seedShortcuts(db: Db): void {
  for (const def of SHORTCUT_DEFAULTS) {
    db.insert(keyboardShortcuts)
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
    db.insert(userSettings)
      .values({
        key: def.key,
        value: def.value,
        description: def.description,
      })
      .onConflictDoUpdate({
        target: userSettings.key,
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
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const [{ Database: BunDatabase }, { drizzle }, { migrate }] = await Promise.all([
    import('bun:sqlite'),
    import('drizzle-orm/bun-sqlite'),
    import('drizzle-orm/bun-sqlite/migrator'),
  ]);

  const sqlite = new BunDatabase(dbPath, { create: true });
  sqlite.run('PRAGMA journal_mode = WAL');
  sqlite.run('PRAGMA synchronous = NORMAL');
  sqlite.run('PRAGMA busy_timeout = 5000');
  sqlite.run('PRAGMA foreign_keys = ON');

  _sqlite = sqlite;
  _db = drizzle({ client: sqlite }) as Db;
  migrate(_db, { migrationsFolder: migrationsDir });

  seedShortcuts(_db);
  seedSettings(_db);
  seedMeetingNoteTemplates(_db);

  log.info({ path: dbPath, migrationsDir, runtime: 'bun-sqlite' }, 'database initialized');
}

export function closeDb(): void {
  if (!_sqlite) return;

  try {
    _sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)');
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
