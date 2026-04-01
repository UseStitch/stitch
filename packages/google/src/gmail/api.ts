import type { GoogleClient } from '../client.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name: string; value: string };

type GmailMessagePartBody = {
  size: number;
  data?: string;
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

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
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
      attachments.push({ filename, mimeType: part.mimeType, size: part.body.size });
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
  filename: string;
  mimeType: string;
  size: number;
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
  messages: {
    id: string;
    threadId: string;
    snippet: string;
    from: string | undefined;
    subject: string | undefined;
    date: string | undefined;
  }[];
  nextPageToken: string | undefined;
  totalEstimate: number;
};

export async function searchMessages(
  client: GoogleClient,
  query: string,
  maxResults = 10,
  pageToken?: string,
): Promise<GmailSearchResult> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);

  const list = await client.request<GmailListResponse>(
    `${GMAIL_API}/messages?${params.toString()}`,
  );

  if (!list.messages?.length) {
    return { messages: [], nextPageToken: undefined, totalEstimate: 0 };
  }

  // Fetch metadata for each message (batch-friendly: only headers)
  const summaries = await Promise.all(
    list.messages.map(async (msg) => {
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
