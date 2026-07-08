import { GmailApiError, GmailAttachmentError } from '../../errors.js';
import {
  createDraftRaw,
  getAttachment,
  getProfile,
  listHistory,
  listLabelsRaw,
  listThreads,
  modifyMessageRaw,
  sendDraftRaw,
  sendMessageRaw,
  trashThreadRaw,
  untrashThreadRaw,
  updateDraftRaw,
  deleteDraftRaw,
  buildGetThreadPath,
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
  SyncThread,
} from '../../contracts.js';

type BackfillCursor = { pageToken: string };
type GmailThread = { id: string; messages?: GmailMessage[] };

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

async function batchGetThreads(
  ctx: MailProviderContext,
  threadIds: string[],
  format: GmailMessageFormat,
): Promise<{ threadId: string; status: number; thread: GmailThread | null }[]> {
  const results: { threadId: string; status: number; thread: GmailThread | null }[] = [];
  for (const group of chunks(threadIds, BATCH_SIZE)) {
    const batch = await gmailBatchRequest<GmailThread>(
      ctx,
      group.map((threadId) => ({
        id: threadId,
        method: 'GET',
        path: `/gmail/v1/users/me${buildGetThreadPath(threadId, format)}`,
      })),
    );
    const byId = new Map(batch.map((item) => [item.id, item]));
    for (const threadId of group) {
      const item = byId.get(threadId);
      results.push({ threadId, status: item?.status ?? 0, thread: item?.body ?? null });
    }
  }
  return results;
}

function parseGmailThread(thread: GmailThread, format: GmailMessageFormat): SyncThread {
  return {
    providerThreadId: thread.id,
    messages: (thread.messages ?? []).map((message) => parseGmailMessage(message, format)),
  };
}

async function batchGetParsedThreads(
  ctx: MailProviderContext,
  threadIds: string[],
  format: GmailMessageFormat,
): Promise<SyncThread[]> {
  const responses = await batchGetThreads(ctx, threadIds, format);
  return responses
    .filter(
      (response): response is { threadId: string; status: number; thread: GmailThread } =>
        response.status >= 200 && response.status < 300 && response.thread !== null,
    )
    .map((response) => parseGmailThread(response.thread, format));
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

async function listAllThreadIdsSince(ctx: MailProviderContext, sinceMs: number): Promise<string[]> {
  const threadIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listThreads(ctx, { afterEpochSeconds: Math.floor(sinceMs / 1000), pageToken });
    threadIds.push(...(page.threads ?? []).map((thread) => thread.id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return threadIds;
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
    const page = await listThreads(ctx, { pageToken: parsedCursor?.pageToken });
    const threadIds = (page.threads ?? []).map((thread) => thread.id);
    const metadataThreads = await batchGetParsedThreads(ctx, threadIds, 'metadata');
    const fullIds = metadataThreads
      .filter((thread) => thread.messages.some((message) => message.internalDate >= fullBodiesAfter))
      .map((thread) => thread.providerThreadId);
    const fullThreads = await batchGetParsedThreads(ctx, fullIds, 'full');
    const fullById = new Map(fullThreads.map((thread) => [thread.providerThreadId, thread]));

    return {
      threads: metadataThreads.map((thread) => fullById.get(thread.providerThreadId) ?? thread),
      nextPageCursor: encodeBackfillCursor(page.nextPageToken),
    };
  },

  async incrementalSync(ctx, syncCursor): Promise<IncrementalResult> {
    const changes: SyncChange[] = [];
    const touchedThreadIds = new Set<string>();
    let pageToken: string | undefined;
    let nextSyncCursor = syncCursor;

    try {
      do {
        const page = await listHistory(ctx, { startHistoryId: syncCursor, pageToken });
        nextSyncCursor = page.historyId;
        for (const history of page.history ?? []) {
          for (const added of history.messagesAdded ?? [])
            if (added.message.threadId) touchedThreadIds.add(added.message.threadId);
          for (const deleted of history.messagesDeleted ?? [])
            if (deleted.message.threadId) touchedThreadIds.add(deleted.message.threadId);
          for (const added of history.labelsAdded ?? [])
            if (added.message.threadId) touchedThreadIds.add(added.message.threadId);
          for (const removed of history.labelsRemoved ?? [])
            if (removed.message.threadId) touchedThreadIds.add(removed.message.threadId);
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) return { status: 'cursor_expired' };
      throw error;
    }

    const threads = await batchGetThreads(ctx, [...touchedThreadIds], 'full');
    for (const response of threads) {
      if (response.status === 404) changes.push({ kind: 'deleteThread', providerThreadId: response.threadId });
      if (response.status >= 200 && response.status < 300 && response.thread) {
        changes.push({ kind: 'upsertThread', thread: parseGmailThread(response.thread, 'full') });
      }
    }

    return { status: 'ok', changes, nextSyncCursor };
  },

  async listThreadsSince(ctx, sinceMs) {
    return batchGetParsedThreads(ctx, await listAllThreadIdsSince(ctx, sinceMs), 'full');
  },

  async getThread(ctx, providerThreadId, hydration) {
    return (await batchGetParsedThreads(ctx, [providerThreadId], hydration))[0] ?? null;
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
