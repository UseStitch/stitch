import { GmailBatchError } from '../../errors.js';

import type { MailProviderContext } from '../../contracts.js';

const GMAIL_BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1';
const MAX_BATCH_OPERATIONS = 50;

export type GmailBatchOperation = { id: string; method: 'GET'; path: string };
export type GmailBatchResult<T = unknown> = { id: string; status: number; body: T | null };

function buildMultipartBody(boundary: string, operations: GmailBatchOperation[]): string {
  return `${operations
    .map(
      (operation) =>
        `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${operation.id}>\r\n\r\n${operation.method} ${operation.path} HTTP/1.1\r\n\r\n`,
    )
    .join('')}--${boundary}--\r\n`;
}

function parseHeaders(rawHeaders: string): Headers {
  const headers = new Headers();
  for (const line of rawHeaders.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    headers.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

function parsePart(part: string): GmailBatchResult | null {
  const httpStart = part.search(/HTTP\/\d(?:\.\d)?\s+\d{3}/);
  if (httpStart === -1) return null;

  const contentId = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i)?.[1] ?? '';
  const httpResponse = part.slice(httpStart).trim();
  const [statusLine = '', ...rest] = httpResponse.split(/\r?\n/);
  const status = Number(statusLine.match(/\s(\d{3})\s/)?.[1] ?? 0);
  const separator = rest.findIndex((line) => line.trim() === '');
  const headerLines = separator === -1 ? rest : rest.slice(0, separator);
  const bodyLines = separator === -1 ? [] : rest.slice(separator + 1);
  const headers = parseHeaders(headerLines.join('\r\n'));
  const bodyText = bodyLines.join('\n').trim();
  const body =
    bodyText && headers.get('content-type')?.includes('application/json') ? JSON.parse(bodyText) : bodyText || null;
  const id = contentId.replace(/^response-/, '');

  return { id, status, body };
}

export function parseGmailBatchResponse(contentType: string | null, body: string): GmailBatchResult[] {
  const boundary =
    contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ??
    contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new GmailBatchError('Gmail batch response did not include a multipart boundary');

  return body
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--')
    .map(parsePart)
    .filter((part): part is GmailBatchResult => part !== null);
}

export async function gmailBatchRequest<T = unknown>(
  ctx: MailProviderContext,
  operations: GmailBatchOperation[],
): Promise<GmailBatchResult<T>[]> {
  if (operations.length > MAX_BATCH_OPERATIONS) {
    throw new GmailBatchError(`Gmail batch requests support at most ${MAX_BATCH_OPERATIONS} operations`);
  }
  if (operations.length === 0) return [];

  const boundary = `stitch-gmail-${crypto.randomUUID()}`;
  const response = await ctx.http.request(GMAIL_BATCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    body: buildMultipartBody(boundary, operations),
    signal: ctx.signal,
  });

  if (!response.ok) throw new GmailBatchError(`Gmail batch request failed with status ${response.status}`);

  return parseGmailBatchResponse(response.headers.get('content-type'), await response.text()) as GmailBatchResult<T>[];
}

export const createGmailBatchRequestBodyForTests = buildMultipartBody;
