import { afterEach, beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import path from 'node:path';

import { closeMailDb, getMailDb, initMailDb } from '../db/client.js';
import { mailAccounts, mailMessages } from '../db/schema.js';
import { runIncremental } from './incremental.js';

import type { MailProviderContext, MailSyncProvider, SyncMessage } from '../contracts.js';

const migrationsDir = path.join(import.meta.dir, '../../drizzle');

const syncedAt = 200_000_000;

function message(): SyncMessage {
  return {
    providerMessageId: 'new-message',
    providerThreadId: 'new-thread',
    from: null,
    to: [],
    cc: [],
    bcc: [],
    subject: 'Recovered',
    snippet: 'Recovered',
    internalDate: syncedAt + 1,
    labelProviderIds: ['INBOX'],
    bodyText: null,
    bodyHtml: null,
    hydration: 'metadata',
    attachments: [],
    headers: { messageId: null, inReplyTo: null, references: null },
  };
}

beforeEach(async () => {
  await initMailDb(':memory:', migrationsDir);
});

afterEach(() => {
  closeMailDb();
});

test('runIncremental follows cursor-expired recovery ladder', async () => {
  const db = getMailDb();
  const [account] = await db
    .insert(mailAccounts)
    .values({
      connectorInstanceId: 'ci_1',
      provider: 'gmail',
      email: 'a@example.com',
      syncPhase: 'incremental',
      syncCursor: 'old',
      lastSyncedAt: syncedAt,
    })
    .returning();
  const calls: string[] = [];
  const provider: MailSyncProvider = {
    id: 'gmail',
    listLabels: async () => [{ providerLabelId: 'INBOX', name: 'Inbox', kind: 'system', color: null }],
    snapshotCursor: async () => {
      calls.push('snapshot');
      return 'new-cursor';
    },
    backfillPage: async () => ({ threads: [], nextPageCursor: undefined }),
    incrementalSync: async () => {
      calls.push('incremental');
      return { status: 'cursor_expired' };
    },
    listThreadsSince: async (_ctx, sinceMs) => {
      calls.push(`since:${sinceMs}`);
      return [{ providerThreadId: 'new-thread', messages: [message()] }];
    },
    getThread: async () => null,
    fetchAttachment: async () => new Uint8Array(),
  };

  const result = await runIncremental(
    {
      account,
      http: { request: fetch },
      logger: consoleLogger,
      signal: new AbortController().signal,
    } satisfies MailProviderContext,
    provider,
  );

  expect(calls).toEqual(['incremental', 'snapshot', `since:${syncedAt - 86_400_000}`]);
  expect(result.queuedReconcile).toBe(true);
  const [updated] = await db.select().from(mailAccounts).where(eq(mailAccounts.id, account.id)).limit(1);
  expect(updated.syncCursor).toBe('new-cursor');
  expect(updated.syncPhase).toBe('reconciling');
  const [persisted] = await db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.providerMessageId, 'new-message'))
    .limit(1);
  expect(persisted.subject).toBe('Recovered');
});

const consoleLogger = { info() {}, warn() {}, error() {} };
