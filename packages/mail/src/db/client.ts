import fs from 'node:fs';
import path from 'node:path';

import { MailConfigurationError } from '../errors.js';
import * as schema from './schema.js';

import type { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export type MailDb = BunSQLiteDatabase<typeof schema>;

let _db: MailDb | undefined;
let _sqlite: Database | undefined;

export function getMailDb(): MailDb {
  if (!_db) throw new MailConfigurationError('Mail database not initialized - call initMailDb() first');
  return _db;
}

export async function initMailDb(dbPath: string, migrationsDir: string): Promise<void> {
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
  _db = drizzle({ client: sqlite, schema }) as MailDb;
  migrate(_db, { migrationsFolder: migrationsDir });
}

export function closeMailDb(): void {
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
}
