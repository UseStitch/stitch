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
import type { SyncChange, SyncLabel, SyncMessage, SyncPage } from '../contracts.js';

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

async function ensureLabels(accountId: MailAccountId, providerLabelIds: string[], db: MailDb): Promise<Map<string, MailLabelId>> {
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

async function getOrCreateThread(accountId: MailAccountId, message: SyncMessage, db: MailDb): Promise<MailThreadId> {
  const [existing] = await db
    .select()
    .from(mailThreads)
    .where(and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, message.providerThreadId)))
    .limit(1);
  if (existing) return existing.id;

  const id = createMailThreadId();
  await db.insert(mailThreads).values({
    id,
    accountId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    snippet: message.snippet,
    lastMessageAt: message.internalDate,
    messageCount: 0,
    hasUnread: false,
    hasAttachments: false,
    isTrashed: false,
    updatedAt: Date.now(),
  });
  return id;
}

async function upsertMessage(accountId: MailAccountId, message: SyncMessage, db: MailDb): Promise<MailThreadId> {
  const threadId = await getOrCreateThread(accountId, message, db);
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
    if (!seenProviderIds.has(attachment.providerAttachmentId)) await db.delete(mailAttachments).where(eq(mailAttachments.id, attachment.id));
  }
  for (const attachment of message.attachments) {
    const existingAttachment = existingAttachments.find((item) => item.providerAttachmentId === attachment.providerAttachmentId);
    if (existingAttachment) {
      await db
        .update(mailAttachments)
        .set({ filename: attachment.filename, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes })
        .where(eq(mailAttachments.id, existingAttachment.id));
    } else {
      await db.insert(mailAttachments).values({ id: createMailAttachmentId(), messageId, ...attachment });
    }
  }

  return threadId;
}

async function applyLabelChange(accountId: MailAccountId, change: Extract<SyncChange, { kind: 'labels' }>, db: MailDb): Promise<MailThreadId | null> {
  const [message] = await db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.accountId, accountId), eq(mailMessages.providerMessageId, change.providerMessageId)))
    .limit(1);
  if (!message) return null;

  const addMap = await ensureLabels(accountId, change.addProviderIds, db);
  for (const labelId of addMap.values()) {
    await db.insert(mailMessageLabels).values({ messageId: message.id, labelId }).onConflictDoNothing();
  }

  if (change.removeProviderIds.length > 0) {
    const labels = await db
      .select()
      .from(mailLabels)
      .where(and(eq(mailLabels.accountId, accountId), inArray(mailLabels.providerLabelId, change.removeProviderIds)));
    for (const label of labels) {
      await db.delete(mailMessageLabels).where(and(eq(mailMessageLabels.messageId, message.id), eq(mailMessageLabels.labelId, label.id)));
    }
  }

  const rows = await db
    .select({ providerLabelId: mailLabels.providerLabelId })
    .from(mailMessageLabels)
    .innerJoin(mailLabels, eq(mailLabels.id, mailMessageLabels.labelId))
    .where(eq(mailMessageLabels.messageId, message.id));
  const providerIds = rows.map((row) => row.providerLabelId);
  await db
    .update(mailMessages)
    .set({
      isUnread: providerIds.includes(UNREAD_PROVIDER_ID),
      isTrashed: providerIds.includes(TRASH_PROVIDER_ID),
      isDraft: providerIds.includes(DRAFT_PROVIDER_ID),
      updatedAt: Date.now(),
    })
    .where(eq(mailMessages.id, message.id));
  return message.threadId;
}

async function deleteMessage(accountId: MailAccountId, providerMessageId: string, db: MailDb): Promise<MailThreadId | null> {
  const [message] = await db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.accountId, accountId), eq(mailMessages.providerMessageId, providerMessageId)))
    .limit(1);
  if (!message) return null;
  await db.delete(mailMessages).where(eq(mailMessages.id, message.id));
  return message.threadId;
}

export async function recomputeThreads(threadIds: MailThreadId[], dbOption?: MailDb): Promise<void> {
  const db = dbOrDefault(dbOption);
  for (const threadId of unique(threadIds)) {
    const messages = await db.select().from(mailMessages).where(eq(mailMessages.threadId, threadId));
    if (messages.length === 0) {
      await db.delete(mailThreads).where(eq(mailThreads.id, threadId));
      continue;
    }

    const latest = messages.reduce((current, message) => (message.internalDate > current.internalDate ? message : current), messages[0]);
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
      .where(and(eq(mailMessageLabels.labelId, label.id), eq(mailMessages.accountId, accountId), eq(mailMessages.isUnread, true)));
    await db.update(mailLabels).set({ totalCount: total?.value ?? 0, unreadCount: unread?.value ?? 0 }).where(eq(mailLabels.id, label.id));
  }
}

async function persistChanges(accountId: MailAccountId, changes: SyncChange[], db: MailDb): Promise<MailThreadId[]> {
  const touched: MailThreadId[] = [];
  for (const change of changes) {
    if (change.kind === 'upsert') touched.push(await upsertMessage(accountId, change.message, db));
    if (change.kind === 'labels') {
      const threadId = await applyLabelChange(accountId, change, db);
      if (threadId) touched.push(threadId);
    }
    if (change.kind === 'delete') {
      const threadId = await deleteMessage(accountId, change.providerMessageId, db);
      if (threadId) touched.push(threadId);
    }
  }
  await recomputeThreads(touched, db);
  await refreshLabelCounts(accountId, db);
  return unique(touched);
}

export async function persistSyncPage(accountId: MailAccountId, page: SyncPage, dbOption?: MailDb): Promise<MailThreadId[]> {
  const db = dbOrDefault(dbOption);
  return persistChanges(
    accountId,
    page.messages.map((message) => ({ kind: 'upsert', message })),
    db,
  );
}

export async function persistSyncChanges(accountId: MailAccountId, changes: SyncChange[], dbOption?: MailDb): Promise<MailThreadId[]> {
  return persistChanges(accountId, changes, dbOrDefault(dbOption));
}

export async function deleteMissingMessagesSince(accountId: MailAccountId, sinceMs: number, providerMessageIds: string[], dbOption?: MailDb): Promise<MailThreadId[]> {
  const db = dbOrDefault(dbOption);
  const providerSet = new Set(providerMessageIds);
  const localMessages = await db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.accountId, accountId), gte(mailMessages.internalDate, sinceMs)));
  const touched: MailThreadId[] = [];
  for (const message of localMessages) {
    if (providerSet.has(message.providerMessageId)) continue;
    await db.delete(mailMessages).where(eq(mailMessages.id, message.id));
    touched.push(message.threadId);
  }
  await recomputeThreads(touched, db);
  await refreshLabelCounts(accountId, db);
  return unique(touched);
}

export const MAIL_SYSTEM_LABELS = { unread: UNREAD_PROVIDER_ID, trash: TRASH_PROVIDER_ID, draft: DRAFT_PROVIDER_ID };
