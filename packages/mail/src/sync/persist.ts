import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { getMailDb, type MailDb } from '../db/client.js';
import {
  createMailAttachmentId,
  createMailLabelId,
  createMailMessageId,
  createMailThreadId,
  mailAttachments,
  mailLabels,
  mailMessageLabels,
  mailMessages,
  mailThreads,
  type MailAccountId,
  type MailLabelId,
  type MailThreadId,
} from '../db/schema.js';

import type { SyncChange, SyncLabel, SyncMessage, SyncPage, SyncThread } from '../contracts.js';

const UNREAD_PROVIDER_ID = 'UNREAD';
const TRASH_PROVIDER_ID = 'TRASH';
const DRAFT_PROVIDER_ID = 'DRAFT';

function dbOrDefault(db?: MailDb): MailDb {
  return db ?? getMailDb();
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function persistLabels(accountId: MailAccountId, labels: SyncLabel[], dbOption?: MailDb): Promise<void> {
  const db = dbOrDefault(dbOption);
  const nowLabels = labels.map((label) => ({
    id: createMailLabelId(),
    accountId,
    providerLabelId: label.providerLabelId,
    name: label.name,
    kind: label.kind,
    color: label.color,
  }));

  for (const label of nowLabels) {
    await db
      .insert(mailLabels)
      .values(label)
      .onConflictDoUpdate({
        target: [mailLabels.accountId, mailLabels.providerLabelId],
        set: { name: label.name, kind: label.kind, color: label.color },
      });
  }
}

async function ensureLabels(
  accountId: MailAccountId,
  providerLabelIds: string[],
  db: MailDb,
): Promise<Map<string, MailLabelId>> {
  const ids = unique(providerLabelIds);
  for (const providerLabelId of ids) {
    await db
      .insert(mailLabels)
      .values({
        id: createMailLabelId(),
        accountId,
        providerLabelId,
        name: providerLabelId,
        kind: providerLabelId === providerLabelId.toUpperCase() ? 'system' : 'user',
        color: null,
      })
      .onConflictDoNothing({ target: [mailLabels.accountId, mailLabels.providerLabelId] });
  }

  if (ids.length === 0) return new Map();
  const labels = await db
    .select()
    .from(mailLabels)
    .where(and(eq(mailLabels.accountId, accountId), inArray(mailLabels.providerLabelId, ids)));
  return new Map(labels.map((label) => [label.providerLabelId, label.id]));
}

async function getOrCreateThread(accountId: MailAccountId, thread: SyncThread, db: MailDb): Promise<MailThreadId> {
  const [existing] = await db
    .select()
    .from(mailThreads)
    .where(and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, thread.providerThreadId)))
    .limit(1);
  if (existing) return existing.id;

  const latest = latestMessage(thread.messages);

  const id = createMailThreadId();
  await db
    .insert(mailThreads)
    .values({
      id,
      accountId,
      providerThreadId: thread.providerThreadId,
      subject: latest?.subject ?? null,
      snippet: latest?.snippet ?? '',
      lastMessageAt: latest?.internalDate ?? 0,
      messageCount: 0,
      hasUnread: false,
      hasAttachments: false,
      isTrashed: false,
      updatedAt: Date.now(),
    });
  return id;
}

function latestMessage(messages: SyncMessage[]): SyncMessage | null {
  if (messages.length === 0) return null;
  return messages.reduce(
    (current, message) => (message.internalDate > current.internalDate ? message : current),
    messages[0],
  );
}

async function upsertMessage(
  accountId: MailAccountId,
  threadId: MailThreadId,
  message: SyncMessage,
  db: MailDb,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.accountId, accountId), eq(mailMessages.providerMessageId, message.providerMessageId)))
    .limit(1);
  const now = Date.now();
  const keepExistingBody = existing?.hydration === 'full' && message.hydration === 'metadata';
  const values = {
    accountId,
    threadId,
    providerMessageId: message.providerMessageId,
    fromJson: stringify(message.from),
    toJson: stringify(message.to),
    ccJson: stringify(message.cc),
    bccJson: stringify(message.bcc),
    subject: message.subject,
    snippet: message.snippet,
    internalDate: message.internalDate,
    isUnread: message.labelProviderIds.includes(UNREAD_PROVIDER_ID),
    isDraft: message.labelProviderIds.includes(DRAFT_PROVIDER_ID),
    isTrashed: message.labelProviderIds.includes(TRASH_PROVIDER_ID),
    hydration: keepExistingBody ? existing.hydration : message.hydration,
    bodyText: keepExistingBody ? existing.bodyText : message.bodyText,
    bodyHtml: keepExistingBody ? existing.bodyHtml : message.bodyHtml,
    rfcMessageId: message.headers.messageId,
    inReplyTo: message.headers.inReplyTo,
    updatedAt: now,
  };

  const messageId = existing?.id ?? createMailMessageId();
  if (existing) {
    await db.update(mailMessages).set(values).where(eq(mailMessages.id, existing.id));
  } else {
    await db.insert(mailMessages).values({ id: messageId, ...values });
  }

  const labelMap = await ensureLabels(accountId, message.labelProviderIds, db);
  await db.delete(mailMessageLabels).where(eq(mailMessageLabels.messageId, messageId));
  for (const labelId of labelMap.values()) {
    await db.insert(mailMessageLabels).values({ messageId, labelId }).onConflictDoNothing();
  }

  const existingAttachments = await db.select().from(mailAttachments).where(eq(mailAttachments.messageId, messageId));
  const seenProviderIds = new Set(message.attachments.map((attachment) => attachment.providerAttachmentId));
  for (const attachment of existingAttachments) {
    if (!seenProviderIds.has(attachment.providerAttachmentId))
      await db.delete(mailAttachments).where(eq(mailAttachments.id, attachment.id));
  }
  for (const attachment of message.attachments) {
    const existingAttachment = existingAttachments.find(
      (item) => item.providerAttachmentId === attachment.providerAttachmentId,
    );
    if (existingAttachment) {
      await db
        .update(mailAttachments)
        .set({ filename: attachment.filename, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes })
        .where(eq(mailAttachments.id, existingAttachment.id));
    } else {
      await db.insert(mailAttachments).values({ id: createMailAttachmentId(), messageId, ...attachment });
    }
  }
}

async function upsertThread(accountId: MailAccountId, thread: SyncThread, db: MailDb): Promise<MailThreadId> {
  const threadId = await getOrCreateThread(accountId, thread, db);
  const providerMessageIds = new Set(thread.messages.map((message) => message.providerMessageId));
  const localMessages = await db.select().from(mailMessages).where(eq(mailMessages.threadId, threadId));
  for (const localMessage of localMessages) {
    if (!providerMessageIds.has(localMessage.providerMessageId))
      await db.delete(mailMessages).where(eq(mailMessages.id, localMessage.id));
  }
  for (const message of thread.messages) await upsertMessage(accountId, threadId, message, db);
  return threadId;
}

async function deleteThread(
  accountId: MailAccountId,
  providerThreadId: string,
  db: MailDb,
): Promise<MailThreadId | null> {
  const [thread] = await db
    .select()
    .from(mailThreads)
    .where(and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, providerThreadId)))
    .limit(1);
  if (!thread) return null;
  await db.delete(mailThreads).where(eq(mailThreads.id, thread.id));
  return thread.id;
}

export async function recomputeThreads(threadIds: MailThreadId[], dbOption?: MailDb): Promise<void> {
  const db = dbOrDefault(dbOption);
  for (const threadId of unique(threadIds)) {
    const messages = await db.select().from(mailMessages).where(eq(mailMessages.threadId, threadId));
    if (messages.length === 0) {
      await db.delete(mailThreads).where(eq(mailThreads.id, threadId));
      continue;
    }

    const latest = messages.reduce(
      (current, message) => (message.internalDate > current.internalDate ? message : current),
      messages[0],
    );
    const [{ value: attachmentCount }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(mailAttachments)
      .innerJoin(mailMessages, eq(mailMessages.id, mailAttachments.messageId))
      .where(eq(mailMessages.threadId, threadId));

    await db
      .update(mailThreads)
      .set({
        subject: latest.subject,
        snippet: latest.snippet,
        lastMessageAt: latest.internalDate,
        messageCount: messages.length,
        hasUnread: messages.some((message) => message.isUnread),
        hasAttachments: (attachmentCount ?? 0) > 0,
        isTrashed: messages.some((message) => message.isTrashed),
        updatedAt: Date.now(),
      })
      .where(eq(mailThreads.id, threadId));
  }
}

export async function refreshLabelCounts(accountId: MailAccountId, dbOption?: MailDb): Promise<void> {
  const db = dbOrDefault(dbOption);
  const labels = await db.select().from(mailLabels).where(eq(mailLabels.accountId, accountId));
  for (const label of labels) {
    const [total] = await db
      .select({ value: sql<number>`count(*)` })
      .from(mailMessageLabels)
      .innerJoin(mailMessages, eq(mailMessages.id, mailMessageLabels.messageId))
      .where(and(eq(mailMessageLabels.labelId, label.id), eq(mailMessages.accountId, accountId)));
    const [unread] = await db
      .select({ value: sql<number>`count(*)` })
      .from(mailMessageLabels)
      .innerJoin(mailMessages, eq(mailMessages.id, mailMessageLabels.messageId))
      .where(
        and(
          eq(mailMessageLabels.labelId, label.id),
          eq(mailMessages.accountId, accountId),
          eq(mailMessages.isUnread, true),
        ),
      );
    await db
      .update(mailLabels)
      .set({ totalCount: total?.value ?? 0, unreadCount: unread?.value ?? 0 })
      .where(eq(mailLabels.id, label.id));
  }
}

async function persistChanges(accountId: MailAccountId, changes: SyncChange[], db: MailDb): Promise<MailThreadId[]> {
  const touched: MailThreadId[] = [];
  for (const change of changes) {
    if (change.kind === 'upsertThread') touched.push(await upsertThread(accountId, change.thread, db));
    if (change.kind === 'deleteThread') {
      const threadId = await deleteThread(accountId, change.providerThreadId, db);
      if (threadId) touched.push(threadId);
    }
  }
  await recomputeThreads(touched, db);
  await refreshLabelCounts(accountId, db);
  return unique(touched);
}

export async function persistSyncPage(
  accountId: MailAccountId,
  page: SyncPage,
  dbOption?: MailDb,
): Promise<MailThreadId[]> {
  const db = dbOrDefault(dbOption);
  return persistChanges(
    accountId,
    page.threads.map((thread) => ({ kind: 'upsertThread', thread })),
    db,
  );
}

export async function persistSyncChanges(
  accountId: MailAccountId,
  changes: SyncChange[],
  dbOption?: MailDb,
): Promise<MailThreadId[]> {
  return persistChanges(accountId, changes, dbOrDefault(dbOption));
}

export async function deleteMissingThreadsSince(
  accountId: MailAccountId,
  sinceMs: number,
  providerThreadIds: string[],
  dbOption?: MailDb,
): Promise<MailThreadId[]> {
  const db = dbOrDefault(dbOption);
  const providerSet = new Set(providerThreadIds);
  const localThreads = await db
    .select()
    .from(mailThreads)
    .where(and(eq(mailThreads.accountId, accountId), gte(mailThreads.lastMessageAt, sinceMs)));
  const touched: MailThreadId[] = [];
  for (const thread of localThreads) {
    if (providerSet.has(thread.providerThreadId)) continue;
    await db.delete(mailThreads).where(eq(mailThreads.id, thread.id));
    touched.push(thread.id);
  }
  await refreshLabelCounts(accountId, db);
  return unique(touched);
}

export const MAIL_SYSTEM_LABELS = { unread: UNREAD_PROVIDER_ID, trash: TRASH_PROVIDER_ID, draft: DRAFT_PROVIDER_ID };
