import { afterEach, beforeEach } from 'bun:test';

import { closeDb, initDb } from '@/db/client.js';

export function setupTestDb(): void {
  beforeEach(async () => {
    process.env['STITCH_DB_PATH'] = ':memory:';
    process.env['NODE_ENV'] = 'development';
    await initDb();
  });

  afterEach(() => {
    closeDb();
    delete process.env['STITCH_DB_PATH'];
  });
}
