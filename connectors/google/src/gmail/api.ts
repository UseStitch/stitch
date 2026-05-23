import fs from 'node:fs/promises';
import path from 'node:path';

import type { GoogleClient } from '../client.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name: string; value: string };

type GmailMessagePartBody = {
  size: number;
  data?: string;
  attachmentId?: string;
};

type GmailMessagePart = {
  mimeType: string;
  headers?: GmailHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
};

type GmailMessageRaw = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload?: GmailMessagePart;
  internalDate?: string;
};

type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailAttachmentResponse = {
  data?: string;
  size: number;
};

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

function decodeBase64UrlBuffer(data: string): Buffer {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function safeFilename(filename: string): string {
  const parsed = Array.from(path.basename(filename))
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .join('')
    .trim();
  return parsed && parsed !== '.' && parsed !== '..' ? parsed : 'attachment';
}

function uniquePath(dir: string, filename: string, used: Set<string>): string {
  const safe = safeFilename(filename);
  const ext = path.extname(safe);
  const name = path.basename(safe, ext);
  let candidate = safe;
  let index = 1;

  while (used.has(candidate)) {
    candidate = `${name}-${index}${ext}`;
    index += 1;
  }

  used.add(candidate);
  return path.join(dir, candidate);
}

function extractHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractAttachments(payload: GmailMessagePart | undefined): GmailAttachment[] {
  if (!payload?.parts) return [];

  const attachments: GmailAttachment[] = [];
  for (const part of payload.parts) {
    const filename =
      extractHeader(part.headers, 'Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ??
      part.headers
        ?.find((h) => h.name.toLowerCase() === 'content-type')
        ?.value.match(/name="?([^";]+)"?/i)?.[1];

    if (filename && part.body?.size) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename,
        mimeType: part.mimeType,
        size: part.body.size,
      });
    }

    // Recurse into nested multipart
    attachments.push(...extractAttachments(part));
  }
  return attachments;
}

function extractBody(payload: GmailMessagePart | undefined): string {
  if (!payload) return '';

  // Single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);

    // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

type GmailAttachment = {
  attachmentId: string | undefined;
  filename: string;
  mimeType: string;
  size: number;
};

type GmailDownloadedAttachment = GmailAttachment & {
  path: string;
};

type GmailMessage = {
  id: string;
  threadId: string;
  from: string | undefined;
  to: string | undefined;
  subject: string | undefined;
  date: string | undefined;
  snippet: string;
  body: string;
  labels: string[];
  attachments: GmailAttachment[];
};

type GmailSearchResult = {
  messages: (
    | { id: string; threadId: string }
    | {
        id: string;
        threadId: string;
        snippet: string;
        from: string | undefined;
        subject: string | undefined;
        date: string | undefined;
      }
  )[];
  nextPageToken: string | undefined;
  totalEstimate: number;
};

type GmailLabelRaw = {
  id: string;
  name: string;
  type?: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
};

type GmailLabel = {
  id: string;
  name: string;
  type: string | undefined;
  messageListVisibility: string | undefined;
  labelListVisibility: string | undefined;
  messagesTotal: number | undefined;
  messagesUnread: number | undefined;
  threadsTotal: number | undefined;
  threadsUnread: number | undefined;
};

type GmailLabelListResponse = {
  labels?: GmailLabelRaw[];
};

type GmailModifyThreadRaw = {
  id: string;
  historyId?: string;
};

type GmailModifyLabelsInput =
  | {
      operation: 'create';
      name: string;
      messageListVisibility?: string;
      labelListVisibility?: string;
    }
  | {
      operation: 'update';
      labelId: string;
      name?: string;
      messageListVisibility?: string;
      labelListVisibility?: string;
    }
  | {
      operation: 'delete';
      labelId: string;
    };

type GmailModifyLabelsResult =
  | {
      operation: 'create' | 'update';
      label: GmailLabel;
    }
  | {
      operation: 'delete';
      labelId: string;
      deleted: true;
    };

type GmailModifyMessagesResult = {
  modifiedTarget: 'message' | 'thread';
  modifiedCount: number;
  results: {
    id: string;
    threadId: string | undefined;
    historyId: string | undefined;
    labelIds: string[] | undefined;
  }[];
};

function mapLabel(raw: GmailLabelRaw): GmailLabel {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    messageListVisibility: raw.messageListVisibility,
    labelListVisibility: raw.labelListVisibility,
    messagesTotal: raw.messagesTotal,
    messagesUnread: raw.messagesUnread,
    threadsTotal: raw.threadsTotal,
    threadsUnread: raw.threadsUnread,
  };
}

export async function searchMessages(
  client: GoogleClient,
  query: string,
  maxResults = 10,
  pageToken?: string,
  idsOnly = true,
): Promise<GmailSearchResult> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);

  const list = await client.request<GmailListResponse>(
    `${GMAIL_API}/messages?${params.toString()}`,
  );

  if (!list.messages?.length) {
    return { messages: [], nextPageToken: undefined, totalEstimate: 0 };
  }

  if (idsOnly) {
    return {
      messages: list.messages.map((msg) => ({ id: msg.id, threadId: msg.threadId })),
      nextPageToken: list.nextPageToken,
      totalEstimate: list.resultSizeEstimate ?? 0,
    };
  }

  // Fetch metadata for each message in chunks to avoid overwhelming the network
  const summaries: GmailSearchResult['messages'] = [];
  const chunkSize = 5;
  for (let i = 0; i < list.messages.length; i += chunkSize) {
    const chunk = list.messages.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (msg) => {
        const full = await client.request<GmailMessageRaw>(
          `${GMAIL_API}/messages/${msg.id}?format=METADATA&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        return {
          id: full.id,
          threadId: full.threadId,
          snippet: full.snippet,
          from: extractHeader(full.payload?.headers, 'From'),
          subject: extractHeader(full.payload?.headers, 'Subject'),
          date: extractHeader(full.payload?.headers, 'Date'),
        };
      }),
    );
    summaries.push(...results);
  }

  return {
    messages: summaries,
    nextPageToken: list.nextPageToken,
    totalEstimate: list.resultSizeEstimate ?? 0,
  };
}

export async function getMessage(client: GoogleClient, messageId: string): Promise<GmailMessage> {
  const raw = await client.request<GmailMessageRaw>(
    `${GMAIL_API}/messages/${messageId}?format=FULL`,
  );

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: extractHeader(raw.payload?.headers, 'From'),
    to: extractHeader(raw.payload?.headers, 'To'),
    subject: extractHeader(raw.payload?.headers, 'Subject'),
    date: extractHeader(raw.payload?.headers, 'Date'),
    snippet: raw.snippet,
    body: extractBody(raw.payload),
    labels: raw.labelIds ?? [],
    attachments: extractAttachments(raw.payload),
  };
}

export async function downloadAttachments(
  client: GoogleClient,
  messageId: string,
  tempPath: string,
): Promise<{ messageId: string; attachments: GmailDownloadedAttachment[] }> {
  const raw = await client.request<GmailMessageRaw>(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=FULL`,
  );
  const attachments = extractAttachments(raw.payload).filter(
    (attachment) => attachment.attachmentId,
  );

  if (attachments.length === 0) {
    return { messageId: raw.id, attachments: [] };
  }

  const outputDir = path.join(tempPath, 'gmail-attachments', raw.id);
  await fs.mkdir(outputDir, { recursive: true });

  const usedFilenames = new Set<string>();
  const downloaded: GmailDownloadedAttachment[] = [];

  for (const attachment of attachments) {
    const attachmentId = attachment.attachmentId;
    if (!attachmentId) continue;

    const response = await client.request<GmailAttachmentResponse>(
      `${GMAIL_API}/messages/${encodeURIComponent(raw.id)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!response.data) {
      throw new Error(`Gmail attachment ${attachmentId} did not include download data`);
    }

    const filePath = uniquePath(outputDir, attachment.filename, usedFilenames);

    await fs.writeFile(filePath, decodeBase64UrlBuffer(response.data));
    downloaded.push({ ...attachment, path: filePath });
  }

  return { messageId: raw.id, attachments: downloaded };
}

export async function sendMessage(
  client: GoogleClient,
  to: string,
  subject: string,
  body: string,
  options?: { from?: string; cc?: string; bcc?: string; inReplyTo?: string; threadId?: string },
): Promise<{ id: string; threadId: string }> {
  const headers = [`To: ${to}`, `Subject: ${subject}`, `Content-Type: text/plain; charset="UTF-8"`];

  if (options?.from) headers.push(`From: ${options.from}`);
  if (options?.cc) headers.push(`Cc: ${options.cc}`);
  if (options?.bcc) headers.push(`Bcc: ${options.bcc}`);
  if (options?.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
    headers.push(`References: ${options.inReplyTo}`);
  }

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${body}`;
  const encoded = btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const payload: Record<string, string> = { raw: encoded };
  if (options?.threadId) payload['threadId'] = options.threadId;

  return client.request<{ id: string; threadId: string }>(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listLabels(client: GoogleClient): Promise<{ labels: GmailLabel[] }> {
  const response = await client.request<GmailLabelListResponse>(`${GMAIL_API}/labels`);
  return {
    labels: (response.labels ?? []).map(mapLabel),
  };
}

export async function getLabels(client: GoogleClient, labelId: string): Promise<GmailLabel> {
  const raw = await client.request<GmailLabelRaw>(
    `${GMAIL_API}/labels/${encodeURIComponent(labelId)}`,
  );
  return mapLabel(raw);
}

export async function modifyLabels(
  client: GoogleClient,
  input: GmailModifyLabelsInput,
): Promise<GmailModifyLabelsResult> {
  if (input.operation === 'create') {
    const raw = await client.request<GmailLabelRaw>(`${GMAIL_API}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        messageListVisibility: input.messageListVisibility,
        labelListVisibility: input.labelListVisibility,
      }),
    });

    return {
      operation: 'create',
      label: mapLabel(raw),
    };
  }

  if (input.operation === 'update') {
    const raw = await client.request<GmailLabelRaw>(
      `${GMAIL_API}/labels/${encodeURIComponent(input.labelId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name: input.name,
          messageListVisibility: input.messageListVisibility,
          labelListVisibility: input.labelListVisibility,
        }),
      },
    );

    return {
      operation: 'update',
      label: mapLabel(raw),
    };
  }

  await client.request(`${GMAIL_API}/labels/${encodeURIComponent(input.labelId)}`, {
    method: 'DELETE',
  });

  return {
    operation: 'delete',
    labelId: input.labelId,
    deleted: true,
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

type GmailFilterCriteria = {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
  negatedQuery?: string;
  hasAttachment?: boolean;
  excludeChats?: boolean;
  size?: number;
  sizeComparison?: 'smaller' | 'larger' | 'unspecified';
};

type GmailFilterAction = {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  forward?: string;
};

type GmailFilterRaw = {
  id: string;
  criteria?: GmailFilterCriteria;
  action?: GmailFilterAction;
};

type GmailFilterListResponse = {
  filter?: GmailFilterRaw[];
};

type GmailFilter = {
  id: string;
  criteria: GmailFilterCriteria;
  action: GmailFilterAction;
  /** Human-readable summary for the LLM, e.g. "from: boss@co.com → add IMPORTANT, skip inbox" */
  summary: string;
};

type GmailFilterInput = {
  criteria?: GmailFilterCriteria;
  action?: GmailFilterAction;
};

/**
 * Build a concise human-readable summary of a filter so the LLM can reason about
 * what each filter does without parsing raw label ID arrays.
 */
function summarizeFilter(criteria: GmailFilterCriteria, action: GmailFilterAction): string {
  const parts: string[] = [];

  // Criteria
  if (criteria.from) parts.push(`from: ${criteria.from}`);
  if (criteria.to) parts.push(`to: ${criteria.to}`);
  if (criteria.subject) parts.push(`subject contains "${criteria.subject}"`);
  if (criteria.query) parts.push(`query: ${criteria.query}`);
  if (criteria.negatedQuery) parts.push(`not matching: ${criteria.negatedQuery}`);
  if (criteria.hasAttachment) parts.push('has attachment');
  if (criteria.excludeChats) parts.push('exclude chats');
  if (
    criteria.size !== undefined &&
    criteria.sizeComparison &&
    criteria.sizeComparison !== 'unspecified'
  ) {
    const bytes = criteria.size;
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const sizeStr =
      mb >= 1 ? `${mb.toFixed(1)} MB` : kb >= 1 ? `${kb.toFixed(0)} KB` : `${bytes} B`;
    parts.push(`size ${criteria.sizeComparison} ${sizeStr}`);
  }

  const matchStr = parts.length > 0 ? parts.join(', ') : 'all messages';

  // Actions
  const actions: string[] = [];

  const LABEL_NAMES: Record<string, string> = {
    INBOX: 'inbox',
    UNREAD: 'unread',
    SPAM: 'spam',
    TRASH: 'trash',
    IMPORTANT: 'important',
    STARRED: 'starred',
    SENT: 'sent',
    DRAFT: 'drafts',
    CATEGORY_PERSONAL: 'category:personal',
    CATEGORY_SOCIAL: 'category:social',
    CATEGORY_PROMOTIONS: 'category:promotions',
    CATEGORY_UPDATES: 'category:updates',
    CATEGORY_FORUMS: 'category:forums',
  };

  function labelName(id: string): string {
    return LABEL_NAMES[id] ?? id;
  }

  if (action.addLabelIds?.length) {
    const effects: string[] = [];
    if (action.addLabelIds.includes('TRASH')) effects.push('delete');
    if (action.addLabelIds.includes('STARRED')) effects.push('star');
    if (action.addLabelIds.includes('IMPORTANT')) effects.push('mark important');
    const userLabels = action.addLabelIds.filter((id) => !LABEL_NAMES[id]);
    if (userLabels.length) effects.push(`label as: ${userLabels.join(', ')}`);
    const remainder = action.addLabelIds.filter(
      (id) => id !== 'TRASH' && id !== 'STARRED' && id !== 'IMPORTANT' && LABEL_NAMES[id],
    );
    if (remainder.length) effects.push(`add labels: ${remainder.map(labelName).join(', ')}`);

    if (effects.length) actions.push(effects.join('; '));
  }

  if (action.removeLabelIds?.length) {
    const effects: string[] = [];
    if (action.removeLabelIds.includes('INBOX')) effects.push('skip inbox (archive)');
    if (action.removeLabelIds.includes('UNREAD')) effects.push('mark as read');
    if (action.removeLabelIds.includes('SPAM')) effects.push('never spam');
    if (action.removeLabelIds.includes('IMPORTANT')) effects.push('never mark important');
    const remainder = action.removeLabelIds.filter(
      (id) => id !== 'INBOX' && id !== 'UNREAD' && id !== 'SPAM' && id !== 'IMPORTANT',
    );
    if (remainder.length) effects.push(`remove labels: ${remainder.map(labelName).join(', ')}`);

    if (effects.length) actions.push(effects.join('; '));
  }

  if (action.removeLabelIds?.length) {
    const names = action.removeLabelIds.map(labelName);

    const effects: string[] = [];
    if (names.includes('inbox')) effects.push('skip inbox (archive)');
    if (names.includes('unread')) effects.push('mark as read');
    if (names.includes('spam')) effects.push('never spam');
    if (names.includes('important')) effects.push('never mark important');
    const remainder = names.filter(
      (n) => n !== 'inbox' && n !== 'unread' && n !== 'spam' && n !== 'important',
    );
    if (remainder.length) effects.push(`remove labels: ${remainder.join(', ')}`);

    if (effects.length) actions.push(effects.join('; '));
  }

  if (action.forward) actions.push(`forward to ${action.forward}`);

  const actionStr = actions.length > 0 ? actions.join(' + ') : 'no action';

  return `Match [${matchStr}] → ${actionStr}`;
}

function mapFilter(raw: GmailFilterRaw): GmailFilter {
  const criteria = raw.criteria ?? {};
  const action = raw.action ?? {};
  return {
    id: raw.id,
    criteria,
    action,
    summary: summarizeFilter(criteria, action),
  };
}

export async function listFilters(client: GoogleClient): Promise<{ filters: GmailFilter[] }> {
  const response = await client.request<GmailFilterListResponse>(`${GMAIL_API}/settings/filters`);
  return {
    filters: (response.filter ?? []).map(mapFilter),
  };
}

export async function getFilter(client: GoogleClient, filterId: string): Promise<GmailFilter> {
  const raw = await client.request<GmailFilterRaw>(
    `${GMAIL_API}/settings/filters/${encodeURIComponent(filterId)}`,
  );
  return mapFilter(raw);
}

export async function createFilter(
  client: GoogleClient,
  input: GmailFilterInput,
): Promise<GmailFilter> {
  const criteria = input.criteria ?? {};

  const hasCriteria = Object.values(criteria).some((v) => v !== undefined);
  if (!hasCriteria) {
    throw new Error(
      'A filter must have at least one criteria field (e.g. from, to, subject, query, hasAttachment).',
    );
  }

  const raw = await client.request<GmailFilterRaw>(`${GMAIL_API}/settings/filters`, {
    method: 'POST',
    body: JSON.stringify({
      criteria,
      action: input.action ?? {},
    }),
  });
  return mapFilter(raw);
}

export async function deleteFilter(
  client: GoogleClient,
  filterId: string,
): Promise<{ filterId: string; deleted: true }> {
  await client.request(`${GMAIL_API}/settings/filters/${encodeURIComponent(filterId)}`, {
    method: 'DELETE',
  });
  return { filterId, deleted: true };
}

export async function modifyMessages(
  client: GoogleClient,
  input: {
    messageIds: string[];
    addLabelIds?: string[];
    removeLabelIds?: string[];
    modifyThreads?: boolean;
  },
): Promise<GmailModifyMessagesResult> {
  const payload = {
    addLabelIds: input.addLabelIds,
    removeLabelIds: input.removeLabelIds,
  };

  if (input.modifyThreads) {
    const results = await Promise.all(
      input.messageIds.map(async (messageId) => {
        const raw = await client.request<GmailModifyThreadRaw>(
          `${GMAIL_API}/threads/${encodeURIComponent(messageId)}/modify`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );

        return {
          id: raw.id,
          threadId: raw.id,
          historyId: raw.historyId,
          labelIds: undefined,
        };
      }),
    );

    return {
      modifiedTarget: 'thread',
      modifiedCount: results.length,
      results,
    };
  }

  await client.request(`${GMAIL_API}/messages/batchModify`, {
    method: 'POST',
    body: JSON.stringify({
      ids: input.messageIds,
      addLabelIds: input.addLabelIds,
      removeLabelIds: input.removeLabelIds,
    }),
  });

  const results = input.messageIds.map((id) => ({
    id,
    threadId: undefined,
    historyId: undefined,
    labelIds: undefined,
  }));

  return {
    modifiedTarget: 'message',
    modifiedCount: results.length,
    results,
  };
}
