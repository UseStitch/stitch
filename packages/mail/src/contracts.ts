import type { MailAccountRecord } from './db/schema.js';

// ── Infrastructure injected by the server ────────────────────────────────
export type MailHttpClient = {
  /** Authed, rate-limited request. Throws on non-retryable failures. */
  request(url: string, init?: RequestInit): Promise<Response>;
};

export type MailLogger = {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

export type MailProviderContext = {
  account: MailAccountRecord; // row from mail_accounts
  http: MailHttpClient;
  logger: MailLogger;
  signal: AbortSignal; // engine cancels on shutdown/disable
};

// ── Normalized provider data (provider → engine) ─────────────────────────
export type SyncLabel = {
  providerLabelId: string;
  name: string;
  kind: 'system' | 'user';
  color: string | null;
};

export type SyncAddress = { name: string | null; email: string };

export type SyncAttachmentMeta = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type SyncMessage = {
  providerMessageId: string;
  providerThreadId: string;
  from: SyncAddress | null;
  to: SyncAddress[];
  cc: SyncAddress[];
  bcc: SyncAddress[];
  subject: string | null;
  snippet: string;
  internalDate: number; // epoch ms
  labelProviderIds: string[];
  bodyText: string | null; // null when hydration === 'metadata'
  bodyHtml: string | null;
  hydration: 'metadata' | 'full';
  attachments: SyncAttachmentMeta[];
  headers: { messageId: string | null; inReplyTo: string | null; references: string | null };
};

export type SyncPage = {
  messages: SyncMessage[];
  /** Opaque resume cursor persisted after each page; undefined = backfill complete. */
  nextPageCursor: string | undefined;
};

export type SyncChange =
  | { kind: 'upsert'; message: SyncMessage }
  | { kind: 'delete'; providerMessageId: string }
  | { kind: 'labels'; providerMessageId: string; addProviderIds: string[]; removeProviderIds: string[] };

export type IncrementalResult =
  | { status: 'ok'; changes: SyncChange[]; nextSyncCursor: string }
  | { status: 'cursor_expired' };

// ── Plugin interfaces ─────────────────────────────────────────────────────
export type MailSyncProvider = {
  readonly id: string; // 'gmail'
  listLabels(ctx: MailProviderContext): Promise<SyncLabel[]>;
  /** Snapshot a sync cursor BEFORE backfill starts (Gmail: current historyId via getProfile). */
  snapshotCursor(ctx: MailProviderContext): Promise<string>;
  /** Newest-first, resumable. `fullBodiesAfter` (epoch ms) controls hydration format. */
  backfillPage(ctx: MailProviderContext, cursor: string | undefined, fullBodiesAfter: number): Promise<SyncPage>;
  incrementalSync(ctx: MailProviderContext, syncCursor: string): Promise<IncrementalResult>;
  /** Approximate catch-up when cursor expired (Gmail: messages.list q=after:<epochSec>). */
  listMessagesSince(ctx: MailProviderContext, sinceMs: number): Promise<SyncMessage[]>;
  hydrateMessages(ctx: MailProviderContext, providerMessageIds: string[]): Promise<SyncMessage[]>;
  fetchAttachment(
    ctx: MailProviderContext,
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Uint8Array>;
};

export type OutgoingDraft = {
  to: SyncAddress[];
  cc: SyncAddress[];
  bcc: SyncAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  inReplyTo: { providerMessageId: string; providerThreadId: string } | null;
};

export type MailOpsProvider = {
  readonly id: string; // 'gmail'
  send(ctx: MailProviderContext, draft: OutgoingDraft): Promise<{ providerMessageId: string; providerThreadId: string }>;
  createDraft(ctx: MailProviderContext, draft: OutgoingDraft): Promise<{ providerDraftId: string }>;
  updateDraft(ctx: MailProviderContext, providerDraftId: string, draft: OutgoingDraft): Promise<void>;
  deleteDraft(ctx: MailProviderContext, providerDraftId: string): Promise<void>;
  sendDraft(ctx: MailProviderContext, providerDraftId: string): Promise<{ providerMessageId: string; providerThreadId: string }>;
  trashThread(ctx: MailProviderContext, providerThreadId: string): Promise<void>;
  untrashThread(ctx: MailProviderContext, providerThreadId: string): Promise<void>;
  modifyMessageLabels(
    ctx: MailProviderContext,
    providerMessageId: string,
    addProviderIds: string[],
    removeProviderIds: string[],
  ): Promise<void>;
};

export type MailProviderModule = { sync: MailSyncProvider; ops: MailOpsProvider };
