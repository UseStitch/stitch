import { afterEach, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { closeMailDb, getMailDb, initMailDb } from '../db/client.js';
import { mailAccounts } from '../db/schema.js';
import { createMailEngine } from './engine.js';

const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));

afterEach(() => {
  closeMailDb();
});

describe('mail engine enrollment', () => {
  test('creates new accounts with manual first sync defaults', async () => {
    await initMailDb(':memory:', migrationsDir);
    const events: unknown[] = [];
    const engine = createMailEngine({
      attachmentsDir: '',
      createHttpClient: () => ({ request: () => Promise.reject(new Error('unexpected request')) }),
      emit: (event) => events.push(event),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const accountId = await engine.accounts.enroll({
      connectorInstanceId: 'ci_1',
      provider: 'gmail',
      email: 'a@example.com',
    });
    const [account] = await getMailDb().select().from(mailAccounts);

    expect(account.id).toBe(accountId);
    expect(account.enabled).toBe(false);
    expect(account.syncPhase).toBe('idle');
    expect(account.backfillDays).toBe(30);
    expect(events).toEqual([{ type: 'account.updated', accountId }]);
  });
});
