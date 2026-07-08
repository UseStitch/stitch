import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { closeMailDb, getMailDb, initMailDb } from '../db/client.js';
import { mailAccounts, mailOutbox } from '../db/schema.js';
import type { MailProviderModule } from '../contracts.js';
import { registerMailProvider } from '../registry.js';
import { createOutbox, OUTBOX_RETRY } from './outbox.js';

const migrationsDir = path.join(import.meta.dir, '../../drizzle');

beforeEach(async () => {
  await initMailDb(':memory:', migrationsDir);
});

afterEach(() => {
  closeMailDb();
});

test('flushOutbox marks failed sends with exponential retry delay', async () => {
  const db = getMailDb();
  const [account] = await db.insert(mailAccounts).values({ connectorInstanceId: 'ci_1', provider: 'gmail', email: 'a@example.com' }).returning();
  registerMailProvider(failingProvider);
  const outbox = createOutbox({
    createContext: (mailAccount) => ({ account: mailAccount, http: { request: fetch }, logger: consoleLogger, signal: new AbortController().signal }),
    emitAccountUpdated() {},
    emitThreadsChanged() {},
    hydrateSentMessage: async () => [],
  });

  const before = Date.now();
  const id = await outbox.enqueue(account.id, 'send', {
    draft: { to: [], cc: [], bcc: [], subject: 'Subject', bodyText: 'Body', bodyHtml: null, inReplyTo: null },
  });
  await outbox.flushOutbox();

  const [row] = await db.select().from(mailOutbox).where(eq(mailOutbox.id, id)).limit(1);
  expect(row.status).toBe('failed');
  expect(row.attempts).toBe(1);
  expect(row.lastError).toBe('temporary');
  expect(row.nextAttemptAt).toBeGreaterThanOrEqual(before + OUTBOX_RETRY.baseBackoffMs * 2);
  expect(row.nextAttemptAt).toBeLessThanOrEqual(Date.now() + OUTBOX_RETRY.baseBackoffMs * 2 + 1000);
});

const failingProvider: MailProviderModule = {
  sync: {
    id: 'gmail',
    listLabels: async () => [],
    snapshotCursor: async () => 'cursor',
    backfillPage: async () => ({ messages: [], nextPageCursor: undefined }),
    incrementalSync: async () => ({ status: 'ok', changes: [], nextSyncCursor: 'cursor' }),
    listMessagesSince: async () => [],
    hydrateMessages: async () => [],
    fetchAttachment: async () => new Uint8Array(),
  },
  ops: {
    id: 'gmail',
    send: async () => {
      throw new Error('temporary');
    },
    createDraft: async () => ({ providerDraftId: 'draft' }),
    updateDraft: async () => {},
    deleteDraft: async () => {},
    sendDraft: async () => ({ providerMessageId: 'msg', providerThreadId: 'thread' }),
    trashThread: async () => {},
    untrashThread: async () => {},
    modifyMessageLabels: async () => {},
  },
};

const consoleLogger = {
  info() {},
  warn() {},
  error() {},
};
