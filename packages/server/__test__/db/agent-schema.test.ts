import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createAgentId } from '@openwork/shared';

import * as schema from '@/db/schema.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('agents schema constraints', () => {
  let sqlite: Database.Database;
  let tempDir: string;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openwork-server-test-'));
    sqlite = new Database(path.join(tempDir, 'test.sqlite'));
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('allows multiple primary agents', () => {
    db.insert(schema.agents)
      .values({
        id: createAgentId(),
        name: 'Primary A',
        type: 'primary',
      })
      .run();

    expect(() =>
      db
        .insert(schema.agents)
        .values({
          id: createAgentId(),
          name: 'Primary B',
          type: 'primary',
        })
        .run(),
    ).not.toThrow();
  });

  test('rejects invalid agent type values', () => {
    expect(() => {
      db.insert(schema.agents)
        .values({
          id: createAgentId(),
          name: 'Invalid Type Agent',
          type: 'invalid' as 'primary' | 'sub',
        })
        .run();
    }).toThrow();
  });
});
