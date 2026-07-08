import { eq, inArray } from 'drizzle-orm';

import { getMailDb } from '@stitch/mail/db/client';
import {
  mailAttachments,
  mailDrafts,
  mailLabels,
  mailMessageLabels,
  mailMessages,
  type MailAttachmentId,
  type MailDraftId,
  type MailMessageId,
} from '@stitch/mail/db/schema';
import type { MailAddressView, MailDraftView, MailLabelView, MailMessageView } from '@stitch/shared/mail/types';

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toLabelView(label: typeof mailLabels.$inferSelect): MailLabelView {
  return label;
}

function toDraftView(draft: typeof mailDrafts.$inferSelect): MailDraftView {
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

export async function getDraftView(draftId: string): Promise<MailDraftView | null> {
  const db = getMailDb();
  const [draft] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, draftId as MailDraftId)).limit(1);
  return draft ? toDraftView(draft) : null;
}

export async function getAttachmentRecord(attachmentId: string): Promise<typeof mailAttachments.$inferSelect | null> {
  const db = getMailDb();
  const [attachment] = await db
    .select()
    .from(mailAttachments)
    .where(eq(mailAttachments.id, attachmentId as MailAttachmentId))
    .limit(1);
  return attachment ?? null;
}

export async function getMessageView(messageId: string): Promise<MailMessageView | null> {
  const db = getMailDb();
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, messageId as MailMessageId)).limit(1);
  if (!message) return null;

  const [labelRows, attachments] = await Promise.all([
    db
      .select({ label: mailLabels })
      .from(mailMessageLabels)
      .innerJoin(mailLabels, eq(mailLabels.id, mailMessageLabels.labelId))
      .where(eq(mailMessageLabels.messageId, message.id)),
    db.select().from(mailAttachments).where(inArray(mailAttachments.messageId, [message.id])),
  ]);

  return {
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
    labels: labelRows.map((row) => toLabelView(row.label)),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      messageId: attachment.messageId,
      providerAttachmentId: attachment.providerAttachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      downloadedAt: attachment.downloadedAt,
    })),
  };
}
