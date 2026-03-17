import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createAgentId } from '@openwork/shared';

import * as schema from '@/db/schema.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe.skipIf(typeof Bun === 'undefined')('agents schema constraints', () => {
  let sqlite: any;
  let tempDir: string;
  let db: any;

  beforeEach(async () => {
    const [{ Database: BunDatabase }, { drizzle }, { migrate }] = await Promise.all([
      import('bun:sqlite'),
      import('drizzle-orm/bun-sqlite'),
      import('drizzle-orm/bun-sqlite/migrator'),
    ]);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openwork-server-test-'));
    sqlite = new BunDatabase(path.join(tempDir, 'test.sqlite'), { create: true });
    db = drizzle({ client: sqlite, schema });
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
