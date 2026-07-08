import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { closeMailDb, getMailDb, initMailDb } from '../db/client.js';
import { mailAccounts, mailLabels, mailThreads } from '../db/schema.js';
import type { SyncMessage } from '../contracts.js';
import { persistLabels, persistSyncPage } from './persist.js';

const migrationsDir = path.join(import.meta.dir, '../../drizzle');

function message(overrides: Partial<SyncMessage>): SyncMessage {
  return {
    providerMessageId: 'msg-1',
    providerThreadId: 'thread-1',
    from: { name: null, email: 'from@example.com' },
    to: [{ name: null, email: 'to@example.com' }],
    cc: [],
    bcc: [],
    subject: 'Hello',
    snippet: 'Snippet',
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

test('persistSyncPage recomputes thread denorms and label counts', async () => {
  const db = getMailDb();
  const [account] = await db.insert(mailAccounts).values({ connectorInstanceId: 'ci_1', provider: 'gmail', email: 'a@example.com' }).returning();
  await persistLabels(account.id, [
    { providerLabelId: 'INBOX', name: 'Inbox', kind: 'system', color: null },
    { providerLabelId: 'UNREAD', name: 'Unread', kind: 'system', color: null },
    { providerLabelId: 'TRASH', name: 'Trash', kind: 'system', color: null },
  ]);

  const touched = await persistSyncPage(account.id, {
    messages: [
      message({ providerMessageId: 'msg-1', labelProviderIds: ['INBOX', 'UNREAD'], internalDate: 1000 }),
      message({ providerMessageId: 'msg-2', labelProviderIds: ['INBOX', 'TRASH'], internalDate: 2000, attachments: [{ providerAttachmentId: 'att-1', filename: 'a.txt', mimeType: 'text/plain', sizeBytes: 3 }] }),
    ],
    nextPageCursor: undefined,
  });

  expect(touched).toHaveLength(1);
  const [thread] = await db.select().from(mailThreads).where(eq(mailThreads.id, touched[0])).limit(1);
  expect(thread.messageCount).toBe(2);
  expect(thread.hasUnread).toBe(true);
  expect(thread.hasAttachments).toBe(true);
  expect(thread.isTrashed).toBe(true);
  expect(thread.lastMessageAt).toBe(2000);

  const labels = await db.select().from(mailLabels).where(eq(mailLabels.accountId, account.id));
  const inbox = labels.find((label) => label.providerLabelId === 'INBOX');
  const unread = labels.find((label) => label.providerLabelId === 'UNREAD');
  expect(inbox?.totalCount).toBe(2);
  expect(inbox?.unreadCount).toBe(1);
  expect(unread?.totalCount).toBe(1);
});
