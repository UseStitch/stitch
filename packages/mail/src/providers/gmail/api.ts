import { GmailApiError } from '../../errors.js';

import type { MailProviderContext } from '../../contracts.js';
import type { GmailMessage } from './parse.js';

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const METADATA_HEADERS = ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Message-ID', 'In-Reply-To', 'References', 'Date'];

type GmailProfile = { emailAddress?: string; messagesTotal?: number; threadsTotal?: number; historyId: string };
type GmailLabel = { id: string; name: string; type?: string; color?: { backgroundColor?: string; textColor?: string } };
type GmailLabelListResponse = { labels?: GmailLabel[] };
type GmailMessageListResponse = { messages?: { id: string; threadId: string }[]; nextPageToken?: string };
type GmailThreadListResponse = { threads?: { id: string }[]; nextPageToken?: string };
type GmailAttachmentResponse = { data?: string; size?: number };
export type GmailMessageFormat = 'full' | 'metadata';
export type GmailHistoryResponse = { history?: GmailHistory[]; nextPageToken?: string; historyId: string };
export type GmailHistory = {
  id?: string;
  messagesAdded?: { message: { id: string; threadId?: string } }[];
  messagesDeleted?: { message: { id: string; threadId?: string } }[];
  labelsAdded?: { message: { id: string; threadId?: string }; labelIds?: string[] }[];
  labelsRemoved?: { message: { id: string; threadId?: string }; labelIds?: string[] }[];
};

function gmailUrl(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return `${GMAIL_API_BASE}${path}${query ? `?${query}` : ''}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function gmailApiRequest<T>(ctx: MailProviderContext, path: string, init?: RequestInit): Promise<T> {
  const response = await ctx.http.request(gmailUrl(path), { ...init, signal: ctx.signal });
  if (!response.ok) {
    throw new GmailApiError(response.status, `Gmail API request failed with status ${response.status}`);
  }
  return readJson<T>(response);
}

export async function getProfile(ctx: MailProviderContext): Promise<GmailProfile> {
  return gmailApiRequest<GmailProfile>(ctx, '/profile');
}

export async function listLabelsRaw(ctx: MailProviderContext): Promise<GmailLabel[]> {
  const response = await gmailApiRequest<GmailLabelListResponse>(ctx, '/labels');
  return response.labels ?? [];
}

export async function listMessages(
  ctx: MailProviderContext,
  input: { pageToken?: string; afterEpochSeconds?: number },
): Promise<GmailMessageListResponse> {
  const params = new URLSearchParams({ maxResults: '500' });
  if (input.pageToken) params.set('pageToken', input.pageToken);
  if (input.afterEpochSeconds !== undefined) params.set('q', `after:${input.afterEpochSeconds}`);
  return gmailApiRequest<GmailMessageListResponse>(ctx, `/messages?${params.toString()}`);
}

export async function listThreads(
  ctx: MailProviderContext,
  input: { pageToken?: string; afterEpochSeconds?: number },
): Promise<GmailThreadListResponse> {
  const params = new URLSearchParams({ maxResults: '500' });
  if (input.pageToken) params.set('pageToken', input.pageToken);
  if (input.afterEpochSeconds !== undefined) params.set('q', `after:${input.afterEpochSeconds}`);
  return gmailApiRequest<GmailThreadListResponse>(ctx, `/threads?${params.toString()}`);
}

export function buildGetMessagePath(messageId: string, format: GmailMessageFormat): string {
  const params = new URLSearchParams({ format });
  if (format === 'metadata') {
    for (const header of METADATA_HEADERS) params.append('metadataHeaders', header);
  }
  return `/messages/${encodeURIComponent(messageId)}?${params.toString()}`;
}

export function buildGetThreadPath(threadId: string, format: GmailMessageFormat): string {
  const params = new URLSearchParams({ format });
  if (format === 'metadata') {
    for (const header of METADATA_HEADERS) params.append('metadataHeaders', header);
  }
  return `/threads/${encodeURIComponent(threadId)}?${params.toString()}`;
}

export async function getMessage(
  ctx: MailProviderContext,
  messageId: string,
  format: GmailMessageFormat,
): Promise<GmailMessage> {
  return gmailApiRequest<GmailMessage>(ctx, buildGetMessagePath(messageId, format));
}

export async function listHistory(
  ctx: MailProviderContext,
  input: { startHistoryId: string; pageToken?: string },
): Promise<GmailHistoryResponse> {
  const params = new URLSearchParams({ startHistoryId: input.startHistoryId });
  for (const type of ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'])
    params.append('historyTypes', type);
  if (input.pageToken) params.set('pageToken', input.pageToken);
  const response = await ctx.http.request(gmailUrl(`/history?${params.toString()}`), { signal: ctx.signal });
  if (response.status === 404) throw new GmailApiError(404, 'Gmail history cursor expired');
  if (!response.ok)
    throw new GmailApiError(response.status, `Gmail history request failed with status ${response.status}`);
  return readJson<GmailHistoryResponse>(response);
}

export async function getAttachment(
  ctx: MailProviderContext,
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachmentResponse> {
  return gmailApiRequest<GmailAttachmentResponse>(
    ctx,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

export async function sendMessageRaw(
  ctx: MailProviderContext,
  raw: string,
  threadId: string | undefined,
): Promise<{ id: string; threadId: string }> {
  return gmailApiRequest(ctx, '/messages/send', { method: 'POST', body: JSON.stringify({ raw, threadId }) });
}

export async function createDraftRaw(
  ctx: MailProviderContext,
  raw: string,
  threadId: string | undefined,
): Promise<{ id: string }> {
  return gmailApiRequest(ctx, '/drafts', { method: 'POST', body: JSON.stringify({ message: { raw, threadId } }) });
}

export async function updateDraftRaw(
  ctx: MailProviderContext,
  draftId: string,
  raw: string,
  threadId: string | undefined,
): Promise<void> {
  await gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: { raw, threadId } }),
  });
}

export async function deleteDraftRaw(ctx: MailProviderContext, draftId: string): Promise<void> {
  await gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
}

export async function sendDraftRaw(
  ctx: MailProviderContext,
  draftId: string,
): Promise<{ id: string; threadId: string }> {
  return gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}/send`, { method: 'POST' });
}

export async function trashThreadRaw(ctx: MailProviderContext, threadId: string): Promise<void> {
  await gmailApiRequest(ctx, `/threads/${encodeURIComponent(threadId)}/trash`, { method: 'POST' });
}

export async function untrashThreadRaw(ctx: MailProviderContext, threadId: string): Promise<void> {
  await gmailApiRequest(ctx, `/threads/${encodeURIComponent(threadId)}/untrash`, { method: 'POST' });
}

export async function modifyMessageRaw(
  ctx: MailProviderContext,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  await gmailApiRequest(ctx, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}
