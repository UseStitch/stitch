import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import { getMailDb, type MailDb } from './client.js';
import {
  mailAccounts,
  mailAttachments,
  mailDrafts,
  mailLabels,
  mailMessageLabels,
  mailMessages,
  mailOutbox,
  mailThreads,
  type MailAccountId,
  type MailDraftRecord,
  type MailLabelId,
  type MailMessageId,
  type MailThreadId,
} from './schema.js';
import type {
  MailAccountView,
  MailAddressView,
  MailAttachmentView,
  MailDraftView,
  MailLabelView,
  MailMessageView,
  MailThreadDetail,
  MailThreadListItem,
} from '@stitch/shared/mail/types';

type ListThreadsOptions = {
  accountId: MailAccountId;
  labelId?: MailLabelId;
  isTrashed?: boolean;
  cursor?: string;
  limit?: number;
  db?: MailDb;
};

type ListThreadsResult = { threads: MailThreadListItem[]; nextCursor: string | null };

type ThreadCursor = { lastMessageAt: number; id: MailThreadId };

function dbOrDefault(db?: MailDb): MailDb {
  return db ?? getMailDb();
}

function encodeThreadCursor(thread: { lastMessageAt: number; id: MailThreadId }): string {
  return `${thread.lastMessageAt}:${thread.id}`;
}

function parseThreadCursor(cursor: string | undefined): ThreadCursor | undefined {
  if (!cursor) return undefined;
  const separator = cursor.indexOf(':');
  if (separator === -1) return undefined;
  const lastMessageAt = Number(cursor.slice(0, separator));
  if (!Number.isFinite(lastMessageAt)) return undefined;
  return { lastMessageAt, id: cursor.slice(separator + 1) as MailThreadId };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toLabelView(label: typeof mailLabels.$inferSelect): MailLabelView {
  return label;
}

function toAttachmentView(attachment: typeof mailAttachments.$inferSelect): MailAttachmentView {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    providerAttachmentId: attachment.providerAttachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    downloadedAt: attachment.downloadedAt,
  };
}

function toDraftView(draft: MailDraftRecord): MailDraftView {
  return {
    id: draft.id,
    accountId: draft.accountId,
    providerDraftId: draft.providerDraftId,
    to: parseJson<MailAddressView[]>(draft.toJson),
    cc: parseJson<MailAddressView[]>(draft.ccJson),
    bcc: parseJson<MailAddressView[]>(draft.bccJson),
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml,
    inReplyToMessageId: draft.inReplyToMessageId,
    dirty: draft.dirty,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

async function labelsForThreads(db: MailDb, threadIds: MailThreadId[]): Promise<Map<MailThreadId, MailLabelView[]>> {
  const labelsByThread = new Map<MailThreadId, MailLabelView[]>();
  if (threadIds.length === 0) return labelsByThread;

  const rows = await db
    .select({ threadId: mailMessages.threadId, label: mailLabels })
    .from(mailMessages)
    .innerJoin(mailMessageLabels, eq(mailMessageLabels.messageId, mailMessages.id))
    .innerJoin(mailLabels, eq(mailLabels.id, mailMessageLabels.labelId))
    .where(inArray(mailMessages.threadId, threadIds));

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.threadId}:${row.label.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labelsByThread.set(row.threadId, [...(labelsByThread.get(row.threadId) ?? []), toLabelView(row.label)]);
  }
  return labelsByThread;
}

async function sendersForThreads(db: MailDb, threadIds: MailThreadId[]): Promise<Map<MailThreadId, MailAddressView | null>> {
  const sendersByThread = new Map<MailThreadId, MailAddressView | null>();
  if (threadIds.length === 0) return sendersByThread;

  const rows = await db
    .select({ threadId: mailMessages.threadId, fromJson: mailMessages.fromJson })
    .from(mailMessages)
    .where(inArray(mailMessages.threadId, threadIds))
    .orderBy(desc(mailMessages.internalDate));

  for (const row of rows) {
    if (!sendersByThread.has(row.threadId)) {
      sendersByThread.set(row.threadId, parseJson<MailAddressView | null>(row.fromJson));
    }
  }

  return sendersByThread;
}

export async function listThreads(options: ListThreadsOptions): Promise<ListThreadsResult> {
  const db = dbOrDefault(options.db);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const cursor = parseThreadCursor(options.cursor);
  const conditions = [eq(mailThreads.accountId, options.accountId), eq(mailThreads.isTrashed, options.isTrashed ?? false)];

  if (cursor) {
    conditions.push(
      or(lt(mailThreads.lastMessageAt, cursor.lastMessageAt), and(eq(mailThreads.lastMessageAt, cursor.lastMessageAt), lt(mailThreads.id, cursor.id)))!,
    );
  }

  if (options.labelId) {
    conditions.push(sql`exists (
      select 1 from ${mailMessages}
      inner join ${mailMessageLabels} on ${mailMessageLabels.messageId} = ${mailMessages.id}
      where ${mailMessages.threadId} = ${mailThreads.id} and ${mailMessageLabels.labelId} = ${options.labelId}
    )`);
  }

  const rows = await db
    .select()
    .from(mailThreads)
    .where(and(...conditions))
    .orderBy(desc(mailThreads.lastMessageAt), desc(mailThreads.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const threadIds = pageRows.map((thread) => thread.id);
  const [labelsByThread, sendersByThread] = await Promise.all([
    labelsForThreads(db, threadIds),
    sendersForThreads(db, threadIds),
  ]);

  return {
    threads: pageRows.map((thread) => ({ ...thread, from: sendersByThread.get(thread.id) ?? null, labels: labelsByThread.get(thread.id) ?? [] })),
    nextCursor: rows.length > limit ? encodeThreadCursor(pageRows[pageRows.length - 1]) : null,
  };
}

export async function getThread(threadId: MailThreadId, dbOption?: MailDb): Promise<MailThreadDetail | null> {
  const db = dbOrDefault(dbOption);
  const [thread] = await db.select().from(mailThreads).where(eq(mailThreads.id, threadId)).limit(1);
  if (!thread) return null;

  const messages = await db.select().from(mailMessages).where(eq(mailMessages.threadId, threadId)).orderBy(asc(mailMessages.internalDate));
  const messageIds = messages.map((message) => message.id);
  const labelRows =
    messageIds.length === 0
      ? []
      : await db
          .select({ messageId: mailMessageLabels.messageId, label: mailLabels })
          .from(mailMessageLabels)
          .innerJoin(mailLabels, eq(mailLabels.id, mailMessageLabels.labelId))
          .where(inArray(mailMessageLabels.messageId, messageIds));
  const attachmentRows = messageIds.length === 0 ? [] : await db.select().from(mailAttachments).where(inArray(mailAttachments.messageId, messageIds));

  const labelsByMessage = new Map<MailMessageId, MailLabelView[]>();
  for (const row of labelRows) labelsByMessage.set(row.messageId, [...(labelsByMessage.get(row.messageId) ?? []), toLabelView(row.label)]);

  const attachmentsByMessage = new Map<MailMessageId, MailAttachmentView[]>();
  for (const attachment of attachmentRows) {
    attachmentsByMessage.set(attachment.messageId, [...(attachmentsByMessage.get(attachment.messageId) ?? []), toAttachmentView(attachment)]);
  }

  const messageViews: MailMessageView[] = messages.map((message) => ({
    id: message.id,
    accountId: message.accountId,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    from: parseJson<MailAddressView | null>(message.fromJson),
    to: parseJson<MailAddressView[]>(message.toJson),
    cc: parseJson<MailAddressView[]>(message.ccJson),
    bcc: parseJson<MailAddressView[]>(message.bccJson),
    subject: message.subject,
    snippet: message.snippet,
    internalDate: message.internalDate,
    isUnread: message.isUnread,
    isDraft: message.isDraft,
    isTrashed: message.isTrashed,
    hydration: message.hydration,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    rfcMessageId: message.rfcMessageId,
    inReplyTo: message.inReplyTo,
    labels: labelsByMessage.get(message.id) ?? [],
    attachments: attachmentsByMessage.get(message.id) ?? [],
  }));

  const [threadLabels, threadSenders] = await Promise.all([labelsForThreads(db, [thread.id]), sendersForThreads(db, [thread.id])]);
  return { ...thread, from: threadSenders.get(thread.id) ?? null, labels: threadLabels.get(thread.id) ?? [], messages: messageViews };
}

export async function listLabels(accountId: MailAccountId, dbOption?: MailDb): Promise<MailLabelView[]> {
  const db = dbOrDefault(dbOption);
  const labels = await db.select().from(mailLabels).where(eq(mailLabels.accountId, accountId)).orderBy(asc(mailLabels.kind), asc(mailLabels.name));
  return labels.map(toLabelView);
}

export async function listAccounts(dbOption?: MailDb): Promise<MailAccountView[]> {
  const db = dbOrDefault(dbOption);
  const accounts = await db.select().from(mailAccounts).orderBy(asc(mailAccounts.email));
  return Promise.all(accounts.map((account) => getAccountView(db, account)));
}

export async function getAccount(accountId: MailAccountId, dbOption?: MailDb): Promise<MailAccountView | null> {
  const db = dbOrDefault(dbOption);
  const [account] = await db.select().from(mailAccounts).where(eq(mailAccounts.id, accountId)).limit(1);
  return account ? getAccountView(db, account) : null;
}

export async function listDrafts(accountId: MailAccountId, dbOption?: MailDb): Promise<MailDraftView[]> {
  const db = dbOrDefault(dbOption);
  const drafts = await db.select().from(mailDrafts).where(eq(mailDrafts.accountId, accountId)).orderBy(desc(mailDrafts.updatedAt));
  return drafts.map(toDraftView);
}

async function getAccountView(db: MailDb, account: typeof mailAccounts.$inferSelect): Promise<MailAccountView> {
  const [[threadCount], [unreadThreadCount], [draftCount], [outboxPendingCount]] = await Promise.all([
    db.select({ value: count() }).from(mailThreads).where(eq(mailThreads.accountId, account.id)),
    db.select({ value: count() }).from(mailThreads).where(and(eq(mailThreads.accountId, account.id), eq(mailThreads.hasUnread, true))),
    db.select({ value: count() }).from(mailDrafts).where(eq(mailDrafts.accountId, account.id)),
    db
      .select({ value: count() })
      .from(mailOutbox)
      .where(and(eq(mailOutbox.accountId, account.id), or(eq(mailOutbox.status, 'pending'), eq(mailOutbox.status, 'failed')))),
  ]);

  return {
    ...account,
    counts: {
      threads: threadCount?.value ?? 0,
      unreadThreads: unreadThreadCount?.value ?? 0,
      drafts: draftCount?.value ?? 0,
      outboxPending: outboxPendingCount?.value ?? 0,
    },
  };
}
