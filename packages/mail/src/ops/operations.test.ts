import { afterEach, beforeEach, expect, test } from 'bun:test';
import path from 'node:path';

import { closeMailDb, getMailDb, initMailDb } from '../db/client.js';
import { getThread } from '../db/queries.js';
import { mailAccounts } from '../db/schema.js';
import { registerMailProvider } from '../registry.js';
import { persistLabels, persistSyncPage } from '../sync/persist.js';
import { createOperations } from './operations.js';

import type { MailProviderModule, SyncMessage } from '../contracts.js';

const migrationsDir = path.join(import.meta.dir, '../../drizzle');

function message(overrides: Partial<SyncMessage>): SyncMessage {
  return {
    providerMessageId: 'msg-1',
    providerThreadId: 'thread-1',
    from: null,
    to: [],
    cc: [],
    bcc: [],
    subject: 'Thread',
    snippet: 'Thread',
    internalDate: 1000,
    labelProviderIds: ['INBOX'],
    bodyText: null,
    bodyHtml: null,
    hydration: 'metadata',
    attachments: [],
    headers: { messageId: null, inReplyTo: null, references: null },
    ...overrides,
  };
}

beforeEach(async () => {
  await initMailDb(':memory:', migrationsDir);
});

afterEach(() => {
  closeMailDb();
});

test('hydrateThread refreshes the complete provider thread', async () => {
  const db = getMailDb();
  const [account] = await db
    .insert(mailAccounts)
    .values({ connectorInstanceId: 'ci_1', provider: 'gmail', email: 'a@example.com' })
    .returning();
  await persistLabels(account.id, [{ providerLabelId: 'INBOX', name: 'Inbox', kind: 'system', color: null }]);
  const [threadId] = await persistSyncPage(account.id, {
    threads: [
      { providerThreadId: 'thread-1', messages: [message({ providerMessageId: 'msg-new', internalDate: 2000 })] },
    ],
    nextPageCursor: undefined,
  });
  registerMailProvider(providerWithCompleteThread);

  const ops = createOperations({
    attachmentsDir: '',
    createContext: (mailAccount) => ({
      account: mailAccount,
      http: { request: fetch },
      logger: consoleLogger,
      signal: new AbortController().signal,
    }),
    emitThreadsChanged() {},
    outbox: { enqueue: async () => 'mob_test', flushOutbox: async () => {} },
  });
  await ops.hydrateThread(threadId);

  const thread = await getThread(threadId);
  expect(thread?.messages.map((item) => item.providerMessageId)).toEqual(['msg-old', 'msg-new']);
  expect(thread?.messages.every((item) => item.hydration === 'full')).toBe(true);
});

const providerWithCompleteThread: MailProviderModule = {
  sync: {
    id: 'gmail',
    listLabels: async () => [],
    snapshotCursor: async () => 'cursor',
    backfillPage: async () => ({ threads: [], nextPageCursor: undefined }),
    incrementalSync: async () => ({ status: 'ok', changes: [], nextSyncCursor: 'cursor' }),
    listThreadsSince: async () => [],
    getThread: async () => ({
      providerThreadId: 'thread-1',
      messages: [
        message({ providerMessageId: 'msg-old', internalDate: 1000, hydration: 'full', bodyText: 'old body' }),
        message({ providerMessageId: 'msg-new', internalDate: 2000, hydration: 'full', bodyText: 'new body' }),
      ],
    }),
    fetchAttachment: async () => new Uint8Array(),
  },
  ops: {
    id: 'gmail',
    send: async () => ({ providerMessageId: 'message', providerThreadId: 'thread' }),
    createDraft: async () => ({ providerDraftId: 'draft' }),
    updateDraft: async () => {},
    deleteDraft: async () => {},
    sendDraft: async () => ({ providerMessageId: 'message', providerThreadId: 'thread' }),
    trashThread: async () => {},
    untrashThread: async () => {},
    modifyMessageLabels: async () => {},
  },
};

const consoleLogger = { info() {}, warn() {}, error() {} };
