import { z } from 'zod';

import { GmailApiError } from '../../errors.js';

import type { MailProviderContext } from '../../contracts.js';

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const METADATA_HEADERS = ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Message-ID', 'In-Reply-To', 'References', 'Date'];

type GmailProfile = { emailAddress?: string; messagesTotal?: number; threadsTotal?: number; historyId: string };
type GmailLabel = { id: string; name: string; type?: string; color?: { backgroundColor?: string; textColor?: string } };
type GmailLabelListResponse = { labels?: GmailLabel[] };
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

const gmailProfileSchema: z.ZodType<GmailProfile> = z.object({
  emailAddress: z.string().optional(),
  messagesTotal: z.number().optional(),
  threadsTotal: z.number().optional(),
  historyId: z.string(),
});
const gmailLabelSchema: z.ZodType<GmailLabel> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  color: z.object({ backgroundColor: z.string().optional(), textColor: z.string().optional() }).optional(),
});
const gmailLabelListResponseSchema: z.ZodType<GmailLabelListResponse> = z.object({
  labels: z.array(gmailLabelSchema).optional(),
});
const gmailThreadListResponseSchema: z.ZodType<GmailThreadListResponse> = z.object({
  threads: z.array(z.object({ id: z.string() })).optional(),
  nextPageToken: z.string().optional(),
});
const gmailAttachmentResponseSchema: z.ZodType<GmailAttachmentResponse> = z.object({
  data: z.string().optional(),
  size: z.number().optional(),
});
const gmailHistoryMessageSchema = z.object({ id: z.string(), threadId: z.string().optional() });
const gmailHistorySchema: z.ZodType<GmailHistory> = z.object({
  id: z.string().optional(),
  messagesAdded: z.array(z.object({ message: gmailHistoryMessageSchema })).optional(),
  messagesDeleted: z.array(z.object({ message: gmailHistoryMessageSchema })).optional(),
  labelsAdded: z
    .array(z.object({ message: gmailHistoryMessageSchema, labelIds: z.array(z.string()).optional() }))
    .optional(),
  labelsRemoved: z
    .array(z.object({ message: gmailHistoryMessageSchema, labelIds: z.array(z.string()).optional() }))
    .optional(),
});
const gmailHistoryResponseSchema: z.ZodType<GmailHistoryResponse> = z.object({
  history: z.array(gmailHistorySchema).optional(),
  nextPageToken: z.string().optional(),
  historyId: z.string(),
});
const gmailMessageResponseSchema = z.object({ id: z.string(), threadId: z.string() });
const gmailDraftResponseSchema = z.object({ id: z.string() });
const emptyResponseSchema = z.looseObject({});

function gmailUrl(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return `${GMAIL_API_BASE}${path}${query ? `?${query}` : ''}`;
}

async function gmailApiRequest<T>(
  ctx: MailProviderContext,
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await ctx.http.request(gmailUrl(path), { ...init, signal: ctx.signal });
  if (!response.ok) throw new GmailApiError(response.status, `Gmail API request failed with status ${response.status}`);
  const text = await response.text();
  return schema.parse(text ? JSON.parse(text) : {});
}

export async function getProfile(ctx: MailProviderContext): Promise<GmailProfile> {
  return gmailApiRequest(ctx, '/profile', gmailProfileSchema);
}
export async function listLabelsRaw(ctx: MailProviderContext): Promise<GmailLabel[]> {
  return (await gmailApiRequest(ctx, '/labels', gmailLabelListResponseSchema)).labels ?? [];
}
export async function listThreads(
  ctx: MailProviderContext,
  input: { pageToken?: string; afterEpochSeconds?: number },
): Promise<GmailThreadListResponse> {
  const params = new URLSearchParams({ maxResults: '500' });
  if (input.pageToken) params.set('pageToken', input.pageToken);
  if (input.afterEpochSeconds !== undefined) params.set('q', `after:${input.afterEpochSeconds}`);
  return gmailApiRequest(ctx, `/threads?${params.toString()}`, gmailThreadListResponseSchema);
}
export function buildGetThreadPath(threadId: string, format: GmailMessageFormat): string {
  const params = new URLSearchParams({ format });
  if (format === 'metadata') for (const header of METADATA_HEADERS) params.append('metadataHeaders', header);
  return `/threads/${encodeURIComponent(threadId)}?${params.toString()}`;
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
  const text = await response.text();
  return gmailHistoryResponseSchema.parse(text ? JSON.parse(text) : {});
}
export async function getAttachment(
  ctx: MailProviderContext,
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachmentResponse> {
  return gmailApiRequest(
    ctx,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    gmailAttachmentResponseSchema,
  );
}
export async function sendMessageRaw(
  ctx: MailProviderContext,
  raw: string,
  threadId: string | undefined,
): Promise<{ id: string; threadId: string }> {
  return gmailApiRequest(ctx, '/messages/send', gmailMessageResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ raw, threadId }),
  });
}
export async function createDraftRaw(
  ctx: MailProviderContext,
  raw: string,
  threadId: string | undefined,
): Promise<{ id: string }> {
  return gmailApiRequest(ctx, '/drafts', gmailDraftResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ message: { raw, threadId } }),
  });
}
export async function updateDraftRaw(
  ctx: MailProviderContext,
  draftId: string,
  raw: string,
  threadId: string | undefined,
): Promise<void> {
  await gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}`, emptyResponseSchema, {
    method: 'PUT',
    body: JSON.stringify({ message: { raw, threadId } }),
  });
}
export async function deleteDraftRaw(ctx: MailProviderContext, draftId: string): Promise<void> {
  await gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}`, emptyResponseSchema, { method: 'DELETE' });
}
export async function sendDraftRaw(
  ctx: MailProviderContext,
  draftId: string,
): Promise<{ id: string; threadId: string }> {
  return gmailApiRequest(ctx, `/drafts/${encodeURIComponent(draftId)}/send`, gmailMessageResponseSchema, {
    method: 'POST',
  });
}
export async function trashThreadRaw(ctx: MailProviderContext, threadId: string): Promise<void> {
  await gmailApiRequest(ctx, `/threads/${encodeURIComponent(threadId)}/trash`, emptyResponseSchema, { method: 'POST' });
}
export async function untrashThreadRaw(ctx: MailProviderContext, threadId: string): Promise<void> {
  await gmailApiRequest(ctx, `/threads/${encodeURIComponent(threadId)}/untrash`, emptyResponseSchema, {
    method: 'POST',
  });
}
export async function modifyMessageRaw(
  ctx: MailProviderContext,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  await gmailApiRequest(ctx, `/messages/${encodeURIComponent(messageId)}/modify`, emptyResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}
