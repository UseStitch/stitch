import { and, eq, inArray } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getMailDb } from '../db/client.js';
import {
  createMailDraftId,
  mailAccounts,
  mailAttachments,
  mailDrafts,
  mailLabels,
  mailMessageLabels,
  mailMessages,
  mailThreads,
  type MailAccountRecord,
  type MailAccountId,
  type MailAttachmentId,
  type MailDraftId,
  type MailLabelId,
  type MailMessageId,
  type MailThreadId,
} from '../db/schema.js';
import { MailNotFoundError } from '../errors.js';
import { getMailProvider } from '../registry.js';
import { persistSyncPage, recomputeThreads, refreshLabelCounts, MAIL_SYSTEM_LABELS } from '../sync/persist.js';

import type { MailProviderContext, OutgoingDraft, SyncAddress } from '../contracts.js';
import type { DraftInput } from '../sync/engine.js';
import type { OutboxController } from './outbox.js';

type OperationsDeps = {
  outbox: OutboxController;
  attachmentsDir: string;
  createContext(account: MailAccountRecord): MailProviderContext;
  emitThreadsChanged(accountId: MailAccountId, threadIds: MailThreadId[]): void;
};

function stringifyAddresses(addresses: SyncAddress[]): string {
  return JSON.stringify(addresses);
}

async function getAccount(accountId: MailAccountId): Promise<MailAccountRecord> {
  const [account] = await getMailDb().select().from(mailAccounts).where(eq(mailAccounts.id, accountId)).limit(1);
  if (!account) throw new MailNotFoundError(`Mail account not found: ${accountId}`);
  return account;
}

async function toOutgoingDraft(input: DraftInput): Promise<OutgoingDraft> {
  const db = getMailDb();
  if (!input.inReplyToMessageId) {
    return {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      inReplyTo: null,
    };
  }
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, input.inReplyToMessageId)).limit(1);
  if (!message) throw new MailNotFoundError(`Reply message not found: ${input.inReplyToMessageId}`);
  const [thread] = await db.select().from(mailThreads).where(eq(mailThreads.id, message.threadId)).limit(1);
  if (!thread) throw new MailNotFoundError(`Reply thread not found: ${message.threadId}`);
  return {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    inReplyTo: { providerMessageId: message.providerMessageId, providerThreadId: thread.providerThreadId },
  };
}

async function labelsById(labelIds: MailLabelId[]): Promise<Map<MailLabelId, string>> {
  if (labelIds.length === 0) return new Map();
  const rows = await getMailDb().select().from(mailLabels).where(inArray(mailLabels.id, labelIds));
  return new Map(rows.map((label) => [label.id, label.providerLabelId]));
}

export function createOperations(deps: OperationsDeps) {
  return {
    async modifyMessage(
      messageId: MailMessageId,
      input: { addLabelIds?: MailLabelId[]; removeLabelIds?: MailLabelId[]; markRead?: boolean },
    ): Promise<void> {
      const db = getMailDb();
      const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, messageId)).limit(1);
      if (!message) throw new MailNotFoundError(`Mail message not found: ${messageId}`);
      const addProviderIds = [...(await labelsById(input.addLabelIds ?? [])).values()];
      const removeProviderIds = [...(await labelsById(input.removeLabelIds ?? [])).values()];
      if (input.markRead) removeProviderIds.push(MAIL_SYSTEM_LABELS.unread);

      const addLabelMap = await labelsById(input.addLabelIds ?? []);
      for (const labelId of addLabelMap.keys())
        await db.insert(mailMessageLabels).values({ messageId: message.id, labelId }).onConflictDoNothing();
      const removeLabelIds = input.markRead
        ? [
            ...(input.removeLabelIds ?? []),
            ...(
              await db
                .select()
                .from(mailLabels)
                .where(
                  and(
                    eq(mailLabels.accountId, message.accountId),
                    eq(mailLabels.providerLabelId, MAIL_SYSTEM_LABELS.unread),
                  ),
                )
            ).map((label) => label.id),
          ]
        : (input.removeLabelIds ?? []);
      for (const labelId of removeLabelIds)
        await db
          .delete(mailMessageLabels)
          .where(and(eq(mailMessageLabels.messageId, message.id), eq(mailMessageLabels.labelId, labelId)));
      await db
        .update(mailMessages)
        .set({ isUnread: input.markRead ? false : message.isUnread, updatedAt: Date.now() })
        .where(eq(mailMessages.id, message.id));
      await recomputeThreads([message.threadId], db);
      await refreshLabelCounts(message.accountId, db);
      await deps.outbox.enqueue(message.accountId, 'modify_labels', {
        messageId,
        providerMessageId: message.providerMessageId,
        addProviderIds,
        removeProviderIds,
      });
      deps.emitThreadsChanged(message.accountId, [message.threadId]);
    },

    async trashThread(threadId: MailThreadId): Promise<void> {
      await setThreadTrash(threadId, true, deps);
    },

    async untrashThread(threadId: MailThreadId): Promise<void> {
      await setThreadTrash(threadId, false, deps);
    },

    async createDraft(input: DraftInput): Promise<MailDraftId> {
      const db = getMailDb();
      await getAccount(input.accountId);
      const id = createMailDraftId();
      await db
        .insert(mailDrafts)
        .values({
          id,
          accountId: input.accountId,
          toJson: stringifyAddresses(input.to),
          ccJson: stringifyAddresses(input.cc),
          bccJson: stringifyAddresses(input.bcc),
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml,
          inReplyToMessageId: input.inReplyToMessageId,
          dirty: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      await deps.outbox.enqueue(input.accountId, 'create_draft', {
        draftId: id,
        providerDraftId: null,
        draft: await toOutgoingDraft(input),
      });
      return id;
    },

    async updateDraft(draftId: MailDraftId, input: Partial<DraftInput>): Promise<void> {
      const db = getMailDb();
      const [draft] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, draftId)).limit(1);
      if (!draft) throw new MailNotFoundError(`Mail draft not found: ${draftId}`);
      const next = {
        accountId: input.accountId ?? draft.accountId,
        to: input.to ?? (JSON.parse(draft.toJson) as SyncAddress[]),
        cc: input.cc ?? (JSON.parse(draft.ccJson) as SyncAddress[]),
        bcc: input.bcc ?? (JSON.parse(draft.bccJson) as SyncAddress[]),
        subject: input.subject ?? draft.subject,
        bodyText: input.bodyText ?? draft.bodyText,
        bodyHtml: input.bodyHtml ?? draft.bodyHtml,
        inReplyToMessageId: input.inReplyToMessageId ?? draft.inReplyToMessageId,
      };
      await db
        .update(mailDrafts)
        .set({
          toJson: stringifyAddresses(next.to),
          ccJson: stringifyAddresses(next.cc),
          bccJson: stringifyAddresses(next.bcc),
          subject: next.subject,
          bodyText: next.bodyText,
          bodyHtml: next.bodyHtml,
          inReplyToMessageId: next.inReplyToMessageId,
          dirty: true,
          updatedAt: Date.now(),
        })
        .where(eq(mailDrafts.id, draft.id));
      await deps.outbox.enqueue(draft.accountId, 'update_draft', {
        draftId,
        providerDraftId: draft.providerDraftId,
        draft: await toOutgoingDraft(next),
      });
    },

    async deleteDraft(draftId: MailDraftId): Promise<void> {
      const db = getMailDb();
      const [draft] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, draftId)).limit(1);
      if (!draft) return;
      await db.delete(mailDrafts).where(eq(mailDrafts.id, draft.id));
      if (draft.providerDraftId)
        await deps.outbox.enqueue(draft.accountId, 'delete_draft', { draftId, providerDraftId: draft.providerDraftId });
    },

    async sendDraft(draftId: MailDraftId): Promise<void> {
      const db = getMailDb();
      const [draft] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, draftId)).limit(1);
      if (!draft) throw new MailNotFoundError(`Mail draft not found: ${draftId}`);
      const input: DraftInput = {
        accountId: draft.accountId,
        to: JSON.parse(draft.toJson) as SyncAddress[],
        cc: JSON.parse(draft.ccJson) as SyncAddress[],
        bcc: JSON.parse(draft.bccJson) as SyncAddress[],
        subject: draft.subject,
        bodyText: draft.bodyText,
        bodyHtml: draft.bodyHtml,
        inReplyToMessageId: draft.inReplyToMessageId,
      };
      await deps.outbox.enqueue(draft.accountId, 'send_draft', {
        draftId,
        providerDraftId: draft.providerDraftId,
        draft: await toOutgoingDraft(input),
      });
    },

    async send(input: DraftInput): Promise<void> {
      await getAccount(input.accountId);
      await deps.outbox.enqueue(input.accountId, 'send', { draft: await toOutgoingDraft(input) });
    },

    async hydrateThread(threadId: MailThreadId): Promise<void> {
      const db = getMailDb();
      const messages = await db
        .select()
        .from(mailMessages)
        .where(and(eq(mailMessages.threadId, threadId), eq(mailMessages.hydration, 'metadata')));
      if (messages.length === 0) return;
      const account = await getAccount(messages[0].accountId);
      const provider = getMailProvider(account.provider);
      const hydrated = await provider.sync.hydrateMessages(
        deps.createContext(account),
        messages.map((message) => message.providerMessageId),
      );
      const touched = await persistSyncPage(account.id, { messages: hydrated, nextPageCursor: undefined }, db);
      deps.emitThreadsChanged(account.id, touched);
    },

    async fetchAttachment(attachmentId: MailAttachmentId): Promise<string> {
      const db = getMailDb();
      const [row] = await db
        .select({ attachment: mailAttachments, message: mailMessages })
        .from(mailAttachments)
        .innerJoin(mailMessages, eq(mailMessages.id, mailAttachments.messageId))
        .where(eq(mailAttachments.id, attachmentId))
        .limit(1);
      if (!row) throw new MailNotFoundError(`Mail attachment not found: ${attachmentId}`);
      if (row.attachment.localPath) return row.attachment.localPath;
      const account = await getAccount(row.message.accountId);
      const provider = getMailProvider(account.provider);
      const bytes = await provider.sync.fetchAttachment(
        deps.createContext(account),
        row.message.providerMessageId,
        row.attachment.providerAttachmentId,
      );
      const accountDir = path.join(deps.attachmentsDir, account.id);
      await fs.mkdir(accountDir, { recursive: true });
      const localPath = path.join(accountDir, row.attachment.id);
      await fs.writeFile(localPath, bytes);
      await db
        .update(mailAttachments)
        .set({ localPath, downloadedAt: Date.now() })
        .where(eq(mailAttachments.id, row.attachment.id));
      return localPath;
    },
  };
}

async function setThreadTrash(threadId: MailThreadId, isTrashed: boolean, deps: OperationsDeps): Promise<void> {
  const db = getMailDb();
  const [thread] = await db.select().from(mailThreads).where(eq(mailThreads.id, threadId)).limit(1);
  if (!thread) throw new MailNotFoundError(`Mail thread not found: ${threadId}`);
  const messages = await db.select().from(mailMessages).where(eq(mailMessages.threadId, thread.id));
  const trashLabels = await db
    .select()
    .from(mailLabels)
    .where(and(eq(mailLabels.accountId, thread.accountId), eq(mailLabels.providerLabelId, MAIL_SYSTEM_LABELS.trash)));
  const trashLabel = trashLabels[0];
  for (const message of messages) {
    await db.update(mailMessages).set({ isTrashed, updatedAt: Date.now() }).where(eq(mailMessages.id, message.id));
    if (trashLabel && isTrashed)
      await db
        .insert(mailMessageLabels)
        .values({ messageId: message.id, labelId: trashLabel.id })
        .onConflictDoNothing();
    if (trashLabel && !isTrashed)
      await db
        .delete(mailMessageLabels)
        .where(and(eq(mailMessageLabels.messageId, message.id), eq(mailMessageLabels.labelId, trashLabel.id)));
  }
  await recomputeThreads([thread.id], db);
  await refreshLabelCounts(thread.accountId, db);
  await deps.outbox.enqueue(thread.accountId, isTrashed ? 'trash_thread' : 'untrash_thread', {
    threadId,
    providerThreadId: thread.providerThreadId,
  });
  deps.emitThreadsChanged(thread.accountId, [thread.id]);
}
