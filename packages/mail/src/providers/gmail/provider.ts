import { GmailApiError, GmailAttachmentError } from '../../errors.js';
import {
  createDraftRaw,
  getAttachment,
  getProfile,
  listHistory,
  listLabelsRaw,
  listMessages,
  modifyMessageRaw,
  sendDraftRaw,
  sendMessageRaw,
  trashThreadRaw,
  untrashThreadRaw,
  updateDraftRaw,
  deleteDraftRaw,
  buildGetMessagePath,
  type GmailMessageFormat,
} from './api.js';
import { gmailBatchRequest } from './batch.js';
import { decodeBase64UrlBytes, parseGmailMessage, type GmailMessage } from './parse.js';

import type {
  IncrementalResult,
  MailOpsProvider,
  MailProviderContext,
  MailProviderModule,
  MailSyncProvider,
  OutgoingDraft,
  SyncChange,
  SyncLabel,
  SyncMessage,
} from '../../contracts.js';

type BackfillCursor = { pageToken: string };

const BATCH_SIZE = 50;

function parseBackfillCursor(cursor: string | undefined): BackfillCursor | undefined {
  if (!cursor) return undefined;
  return JSON.parse(cursor) as BackfillCursor;
}

function encodeBackfillCursor(pageToken: string | undefined): string | undefined {
  return pageToken ? JSON.stringify({ pageToken } satisfies BackfillCursor) : undefined;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function batchGetMessages(
  ctx: MailProviderContext,
  messageIds: string[],
  format: GmailMessageFormat,
): Promise<{ messageId: string; status: number; message: GmailMessage | null }[]> {
  const results: { messageId: string; status: number; message: GmailMessage | null }[] = [];
  for (const group of chunks(messageIds, BATCH_SIZE)) {
    const batch = await gmailBatchRequest<GmailMessage>(
      ctx,
      group.map((messageId) => ({
        id: messageId,
        method: 'GET',
        path: `/gmail/v1/users/me${buildGetMessagePath(messageId, format)}`,
      })),
    );
    const byId = new Map(batch.map((item) => [item.id, item]));
    for (const messageId of group) {
      const item = byId.get(messageId);
      results.push({ messageId, status: item?.status ?? 0, message: item?.body ?? null });
    }
  }
  return results;
}

async function batchGetParsedMessages(
  ctx: MailProviderContext,
  messageIds: string[],
  format: GmailMessageFormat,
): Promise<SyncMessage[]> {
  const responses = await batchGetMessages(ctx, messageIds, format);
  return responses
    .filter(
      (response): response is { messageId: string; status: number; message: GmailMessage } =>
        response.status >= 200 && response.status < 300 && response.message !== null,
    )
    .map((response) => parseGmailMessage(response.message, format));
}

function buildAddressHeader(name: string | null, email: string): string {
  if (!name) return email;
  const escapedName = name.replace(/"/g, '\\"');
  return `"${escapedName}" <${email}>`;
}

function buildAddressListHeader(addresses: OutgoingDraft['to']): string | undefined {
  return addresses.length
    ? addresses.map((address) => buildAddressHeader(address.name, address.email)).join(', ')
    : undefined;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRfc2822Message(draft: OutgoingDraft): { raw: string; threadId: string | undefined } {
  const headers: string[] = [];
  const to = buildAddressListHeader(draft.to);
  const cc = buildAddressListHeader(draft.cc);
  const bcc = buildAddressListHeader(draft.bcc);
  if (to) headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${draft.subject}`);
  if (draft.inReplyTo) {
    headers.push(`In-Reply-To: ${draft.inReplyTo.providerMessageId}`);
    headers.push(`References: ${draft.inReplyTo.providerMessageId}`);
  }
  headers.push('MIME-Version: 1.0');

  if (!draft.bodyHtml) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    return {
      raw: base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${draft.bodyText}`),
      threadId: draft.inReplyTo?.providerThreadId,
    };
  }

  const boundary = `stitch-mail-${crypto.randomUUID()}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    draft.bodyText,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    draft.bodyHtml,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return {
    raw: base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${body}`),
    threadId: draft.inReplyTo?.providerThreadId,
  };
}

function mapLabel(label: { id: string; name: string; type?: string; color?: { backgroundColor?: string } }): SyncLabel {
  return {
    providerLabelId: label.id,
    name: label.name,
    kind: label.type === 'system' ? 'system' : 'user',
    color: label.color?.backgroundColor ?? null,
  };
}

async function listAllMessageIdsSince(ctx: MailProviderContext, sinceMs: number): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listMessages(ctx, { afterEpochSeconds: Math.floor(sinceMs / 1000), pageToken });
    messageIds.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return messageIds;
}

export const gmailSyncProvider: MailSyncProvider = {
  id: 'gmail',

  async listLabels(ctx) {
    return (await listLabelsRaw(ctx)).map(mapLabel);
  },

  async snapshotCursor(ctx) {
    return (await getProfile(ctx)).historyId;
  },

  async backfillPage(ctx, cursor, fullBodiesAfter) {
    const parsedCursor = parseBackfillCursor(cursor);
    const page = await listMessages(ctx, { pageToken: parsedCursor?.pageToken });
    const messageIds = (page.messages ?? []).map((message) => message.id);
    const metadataMessages = await batchGetParsedMessages(ctx, messageIds, 'metadata');
    const fullIds = metadataMessages
      .filter((message) => message.internalDate >= fullBodiesAfter)
      .map((message) => message.providerMessageId);
    const fullMessages = await batchGetParsedMessages(ctx, fullIds, 'full');
    const fullById = new Map(fullMessages.map((message) => [message.providerMessageId, message]));

    return {
      messages: metadataMessages.map((message) => fullById.get(message.providerMessageId) ?? message),
      nextPageCursor: encodeBackfillCursor(page.nextPageToken),
    };
  },

  async incrementalSync(ctx, syncCursor): Promise<IncrementalResult> {
    const changes: SyncChange[] = [];
    const upsertIds = new Set<string>();
    const deletedIds = new Set<string>();
    const labelChanges = new Map<string, { addProviderIds: Set<string>; removeProviderIds: Set<string> }>();
    let pageToken: string | undefined;
    let nextSyncCursor = syncCursor;

    try {
      do {
        const page = await listHistory(ctx, { startHistoryId: syncCursor, pageToken });
        nextSyncCursor = page.historyId;
        for (const history of page.history ?? []) {
          for (const added of history.messagesAdded ?? []) upsertIds.add(added.message.id);
          for (const deleted of history.messagesDeleted ?? []) deletedIds.add(deleted.message.id);
          for (const added of history.labelsAdded ?? []) {
            const existing = labelChanges.get(added.message.id) ?? {
              addProviderIds: new Set<string>(),
              removeProviderIds: new Set<string>(),
            };
            for (const labelId of added.labelIds ?? []) existing.addProviderIds.add(labelId);
            labelChanges.set(added.message.id, existing);
          }
          for (const removed of history.labelsRemoved ?? []) {
            const existing = labelChanges.get(removed.message.id) ?? {
              addProviderIds: new Set<string>(),
              removeProviderIds: new Set<string>(),
            };
            for (const labelId of removed.labelIds ?? []) existing.removeProviderIds.add(labelId);
            labelChanges.set(removed.message.id, existing);
          }
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) return { status: 'cursor_expired' };
      throw error;
    }

    const upserts = await batchGetMessages(ctx, [...upsertIds], 'full');
    for (const response of upserts) {
      if (response.status === 404) {
        changes.push({ kind: 'delete', providerMessageId: response.messageId });
      } else if (response.status >= 200 && response.status < 300 && response.message) {
        changes.push({ kind: 'upsert', message: parseGmailMessage(response.message, 'full') });
      }
    }
    for (const providerMessageId of deletedIds) changes.push({ kind: 'delete', providerMessageId });
    for (const [providerMessageId, change] of labelChanges) {
      changes.push({
        kind: 'labels',
        providerMessageId,
        addProviderIds: [...change.addProviderIds],
        removeProviderIds: [...change.removeProviderIds],
      });
    }

    return { status: 'ok', changes, nextSyncCursor };
  },

  async listMessagesSince(ctx, sinceMs) {
    return batchGetParsedMessages(ctx, await listAllMessageIdsSince(ctx, sinceMs), 'full');
  },

  async hydrateMessages(ctx, providerMessageIds) {
    return batchGetParsedMessages(ctx, providerMessageIds, 'full');
  },

  async fetchAttachment(ctx, providerMessageId, providerAttachmentId) {
    const response = await getAttachment(ctx, providerMessageId, providerAttachmentId);
    if (!response.data)
      throw new GmailAttachmentError(`Gmail attachment ${providerAttachmentId} did not include download data`);
    return decodeBase64UrlBytes(response.data);
  },
};

export const gmailOpsProvider: MailOpsProvider = {
  id: 'gmail',

  async send(ctx, draft) {
    const message = buildRfc2822Message(draft);
    const response = await sendMessageRaw(ctx, message.raw, message.threadId);
    return { providerMessageId: response.id, providerThreadId: response.threadId };
  },

  async createDraft(ctx, draft) {
    const message = buildRfc2822Message(draft);
    const response = await createDraftRaw(ctx, message.raw, message.threadId);
    return { providerDraftId: response.id };
  },

  async updateDraft(ctx, providerDraftId, draft) {
    const message = buildRfc2822Message(draft);
    await updateDraftRaw(ctx, providerDraftId, message.raw, message.threadId);
  },

  async deleteDraft(ctx, providerDraftId) {
    await deleteDraftRaw(ctx, providerDraftId);
  },

  async sendDraft(ctx, providerDraftId) {
    const response = await sendDraftRaw(ctx, providerDraftId);
    return { providerMessageId: response.id, providerThreadId: response.threadId };
  },

  async trashThread(ctx, providerThreadId) {
    await trashThreadRaw(ctx, providerThreadId);
  },

  async untrashThread(ctx, providerThreadId) {
    await untrashThreadRaw(ctx, providerThreadId);
  },

  async modifyMessageLabels(ctx, providerMessageId, addProviderIds, removeProviderIds) {
    await modifyMessageRaw(ctx, providerMessageId, addProviderIds, removeProviderIds);
  },
};

export const gmailProviderModule: MailProviderModule = { sync: gmailSyncProvider, ops: gmailOpsProvider };

export const createGmailRawMessageForTests = buildRfc2822Message;
