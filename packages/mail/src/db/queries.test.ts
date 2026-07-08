import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import { getAccount, getThread, listAccounts, listDrafts, listLabels, listThreads } from './queries.js';
import * as schema from './schema.js';
import type { MailDb } from './client.js';

let sqlite: Database;
let db: MailDb;

const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  db = drizzle({ client: sqlite, schema }) as MailDb;
  migrate(db, { migrationsFolder: migrationsDir });
});

afterEach(() => {
  sqlite.close();
});

describe('listThreads', () => {
  test('paginates by lastMessageAt and id', async () => {
    const accountId = schema.createMailAccountId();
    const threadA = schema.createMailThreadId();
    const threadB = schema.createMailThreadId();
    const threadC = schema.createMailThreadId();

    await db.insert(schema.mailAccounts).values({ id: accountId, connectorInstanceId: 'conn_1', provider: 'gmail', email: 'a@example.com' });
    await db.insert(schema.mailThreads).values([
      {
        id: threadA,
        accountId,
        providerThreadId: 'provider-a',
        subject: 'A',
        snippet: 'A',
        lastMessageAt: 300,
      },
      {
        id: threadB,
        accountId,
        providerThreadId: 'provider-b',
        subject: 'B',
        snippet: 'B',
        lastMessageAt: 200,
      },
      {
        id: threadC,
        accountId,
        providerThreadId: 'provider-c',
        subject: 'C',
        snippet: 'C',
        lastMessageAt: 100,
      },
    ]);

    const firstPage = await listThreads({ accountId, limit: 2, db });
    const secondPage = await listThreads({ accountId, limit: 2, cursor: firstPage.nextCursor ?? undefined, db });

    expect(firstPage.threads.map((thread) => thread.id)).toEqual([threadA, threadB]);
    expect(firstPage.nextCursor).toBe(`${200}:${threadB}`);
    expect(secondPage.threads.map((thread) => thread.id)).toEqual([threadC]);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('filters by label and trash state', async () => {
    const accountId = schema.createMailAccountId();
    const inboxLabelId = schema.createMailLabelId();
    const inboxThreadId = schema.createMailThreadId();
    const trashThreadId = schema.createMailThreadId();
    const inboxMessageId = schema.createMailMessageId();

    await db.insert(schema.mailAccounts).values({ id: accountId, connectorInstanceId: 'conn_1', provider: 'gmail', email: 'a@example.com' });
    await db.insert(schema.mailLabels).values({ id: inboxLabelId, accountId, providerLabelId: 'INBOX', name: 'Inbox', kind: 'system' });
    await db.insert(schema.mailThreads).values([
      { id: inboxThreadId, accountId, providerThreadId: 'provider-inbox', snippet: 'Inbox', lastMessageAt: 200 },
      { id: trashThreadId, accountId, providerThreadId: 'provider-trash', snippet: 'Trash', lastMessageAt: 100, isTrashed: true },
    ]);
    await db.insert(schema.mailMessages).values({
      id: inboxMessageId,
      accountId,
      threadId: inboxThreadId,
      providerMessageId: 'provider-message',
      fromJson: 'null',
      toJson: '[]',
      ccJson: '[]',
      bccJson: '[]',
      snippet: 'Inbox',
      internalDate: 200,
      hydration: 'metadata',
    });
    await db.insert(schema.mailMessageLabels).values({ messageId: inboxMessageId, labelId: inboxLabelId });

    const inboxThreads = await listThreads({ accountId, labelId: inboxLabelId, db });
    const trashedThreads = await listThreads({ accountId, isTrashed: true, db });

    expect(inboxThreads.threads.map((thread) => thread.id)).toEqual([inboxThreadId]);
    expect(inboxThreads.threads[0]?.labels.map((label) => label.id)).toEqual([inboxLabelId]);
    expect(trashedThreads.threads.map((thread) => thread.id)).toEqual([trashThreadId]);
  });

  test('returns account, label, draft, and thread details', async () => {
    const accountId = schema.createMailAccountId();
    const labelId = schema.createMailLabelId();
    const threadId = schema.createMailThreadId();
    const messageId = schema.createMailMessageId();
    const attachmentId = schema.createMailAttachmentId();
    const draftId = schema.createMailDraftId();

    await db.insert(schema.mailAccounts).values({ id: accountId, connectorInstanceId: 'conn_1', provider: 'gmail', email: 'a@example.com' });
    await db.insert(schema.mailLabels).values({ id: labelId, accountId, providerLabelId: 'INBOX', name: 'Inbox', kind: 'system' });
    await db.insert(schema.mailThreads).values({ id: threadId, accountId, providerThreadId: 'provider-thread', snippet: 'Hello', lastMessageAt: 100 });
    await db.insert(schema.mailMessages).values({
      id: messageId,
      accountId,
      threadId,
      providerMessageId: 'provider-message',
      fromJson: JSON.stringify({ name: 'A', email: 'a@example.com' }),
      toJson: '[]',
      ccJson: '[]',
      bccJson: '[]',
      snippet: 'Hello',
      internalDate: 100,
      hydration: 'full',
      bodyText: 'Hello',
    });
    await db.insert(schema.mailMessageLabels).values({ messageId, labelId });
    await db.insert(schema.mailAttachments).values({
      id: attachmentId,
      messageId,
      providerAttachmentId: 'attachment',
      filename: 'a.txt',
      mimeType: 'text/plain',
      sizeBytes: 1,
    });
    await db.insert(schema.mailDrafts).values({ id: draftId, accountId, toJson: '[]', ccJson: '[]', bccJson: '[]', subject: 'Draft', bodyText: 'Body' });

    const [account, accounts, labels, drafts, threadList, thread] = await Promise.all([
      getAccount(accountId, db),
      listAccounts(db),
      listLabels(accountId, db),
      listDrafts(accountId, db),
      listThreads({ accountId, db }),
      getThread(threadId, db),
    ]);

    expect(account?.counts.drafts).toBe(1);
    expect(accounts.map((item) => item.id)).toEqual([accountId]);
    expect(labels.map((label) => label.id)).toEqual([labelId]);
    expect(drafts.map((draft) => draft.id)).toEqual([draftId]);
    expect(threadList.threads[0]?.from).toEqual({ name: 'A', email: 'a@example.com' });
    expect(thread?.from).toEqual({ name: 'A', email: 'a@example.com' });
    expect(thread?.messages[0]?.attachments[0]?.id).toBe(attachmentId);
  });
});
