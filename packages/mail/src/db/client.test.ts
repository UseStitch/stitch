import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'bun:test';

import { closeMailDb, getMailDb, initMailDb } from './client.js';
import { mailAccounts } from './schema.js';

const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));

afterEach(() => {
  closeMailDb();
});

describe('mail db client', () => {
  test('initializes an in-memory migrated database', async () => {
    await initMailDb(':memory:', migrationsDir);
    const db = getMailDb();
    const accounts = await db.select().from(mailAccounts);

    expect(accounts).toEqual([]);
  });
});
