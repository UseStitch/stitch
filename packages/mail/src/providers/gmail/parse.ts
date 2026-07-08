import type { SyncAddress, SyncAttachmentMeta, SyncMessage } from '../../contracts.js';

export type GmailHeader = { name: string; value: string };

export type GmailMessagePartBody = { size?: number; data?: string; attachmentId?: string };

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
};

const ADDRESS_SPLIT_REGEX = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
const ENCODED_WORD_REGEX = /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g;

export function decodeBase64UrlBytes(data: string): Uint8Array {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

function decodeBase64Url(data: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(data));
}

function decodeQuotedPrintable(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '_' ) {
      bytes.push(32);
      continue;
    }
    if (value[i] === '=' && /^[0-9a-fA-F]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(value.charCodeAt(i));
  }
  return Uint8Array.from(bytes);
}

function decodeEncodedWords(value: string): string {
  return value.replace(ENCODED_WORD_REGEX, (_match, charset: string, encoding: string, text: string) => {
    const bytes = encoding.toLowerCase() === 'b' ? Buffer.from(text, 'base64') : decodeQuotedPrintable(text);
    try {
      return new TextDecoder(charset as ConstructorParameters<typeof TextDecoder>[0]).decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  });
}

function extractHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).replace(/\\"/g, '"') : trimmed;
}

function parseAddress(value: string): SyncAddress | null {
  const decoded = decodeEncodedWords(value).trim();
  if (!decoded) return null;

  const angleMatch = decoded.match(/^(.*)<([^<>]+)>$/);
  if (angleMatch) {
    const name = stripQuotes(angleMatch[1].trim());
    return { name: name || null, email: angleMatch[2].trim() };
  }

  const emailMatch = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!emailMatch) return null;

  return { name: null, email: emailMatch[0] };
}

function parseAddressList(value: string | null): SyncAddress[] {
  if (!value) return [];
  return value
    .split(ADDRESS_SPLIT_REGEX)
    .map(parseAddress)
    .filter((address): address is SyncAddress => address !== null);
}

function findFilename(part: GmailMessagePart): string | null {
  if (part.filename?.trim()) return part.filename.trim();

  const disposition = extractHeader(part.headers, 'Content-Disposition');
  const contentType = extractHeader(part.headers, 'Content-Type');
  return (
    disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1] ??
    contentType?.match(/name\*?=(?:UTF-8''|")?([^";]+)/i)?.[1] ??
    null
  );
}

function isAttachment(part: GmailMessagePart): boolean {
  const disposition = extractHeader(part.headers, 'Content-Disposition')?.toLowerCase();
  return Boolean(part.body?.attachmentId && (findFilename(part) || disposition?.includes('attachment')));
}

function walkPayload(
  payload: GmailMessagePart | undefined,
  result: { text: string[]; html: string[]; attachments: SyncAttachmentMeta[] },
): void {
  if (!payload) return;

  if (isAttachment(payload) && payload.body?.attachmentId) {
    result.attachments.push({
      providerAttachmentId: payload.body.attachmentId,
      filename: decodeEncodedWords(findFilename(payload) ?? 'attachment'),
      mimeType: payload.mimeType ?? 'application/octet-stream',
      sizeBytes: payload.body.size ?? 0,
    });
  }

  if (payload.body?.data && !isAttachment(payload)) {
    if (payload.mimeType === 'text/plain') result.text.push(decodeBase64Url(payload.body.data));
    if (payload.mimeType === 'text/html') result.html.push(decodeBase64Url(payload.body.data));
  }

  for (const part of payload.parts ?? []) walkPayload(part, result);
}

export function parseGmailMessage(message: GmailMessage, hydration: 'metadata' | 'full'): SyncMessage {
  const headers = message.payload?.headers;
  const body = { text: [] as string[], html: [] as string[], attachments: [] as SyncAttachmentMeta[] };
  if (hydration === 'full') walkPayload(message.payload, body);

  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    from: parseAddress(extractHeader(headers, 'From') ?? ''),
    to: parseAddressList(extractHeader(headers, 'To')),
    cc: parseAddressList(extractHeader(headers, 'Cc')),
    bcc: parseAddressList(extractHeader(headers, 'Bcc')),
    subject: extractHeader(headers, 'Subject'),
    snippet: message.snippet ?? '',
    internalDate: Number(message.internalDate ?? 0),
    labelProviderIds: message.labelIds ?? [],
    bodyText: hydration === 'full' ? body.text.join('\n') || null : null,
    bodyHtml: hydration === 'full' ? body.html.join('\n') || null : null,
    hydration,
    attachments: body.attachments,
    headers: {
      messageId: extractHeader(headers, 'Message-ID'),
      inReplyTo: extractHeader(headers, 'In-Reply-To'),
      references: extractHeader(headers, 'References'),
    },
  };
}
