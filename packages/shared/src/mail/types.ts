import type { PrefixedString } from '../id/index.js';

export type MailAccountId = PrefixedString<'macc'>;
export type MailLabelId = PrefixedString<'mlbl'>;
export type MailThreadId = PrefixedString<'mthr'>;
export type MailMessageId = PrefixedString<'mmsg'>;
export type MailAttachmentId = PrefixedString<'matt'>;
export type MailDraftId = PrefixedString<'mdrf'>;

export type MailSyncPhase = 'idle' | 'backfill' | 'incremental' | 'reconciling' | 'error';
export type MailLabelKind = 'system' | 'user';
export type MailHydration = 'metadata' | 'full';
export type MailAddressView = { name: string | null; email: string };

export type MailAccountView = {
  id: MailAccountId;
  connectorInstanceId: string;
  provider: 'gmail';
  email: string;
  enabled: boolean;
  syncPhase: MailSyncPhase;
  syncCursor: string | null;
  backfillCursor: string | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  syncFrequencySeconds: number;
  backfillDays: number;
  counts: { threads: number; unreadThreads: number; drafts: number; outboxPending: number };
  createdAt: number;
  updatedAt: number;
};

export type MailLabelView = {
  id: MailLabelId;
  accountId: MailAccountId;
  providerLabelId: string;
  name: string;
  kind: MailLabelKind;
  color: string | null;
  unreadCount: number;
  totalCount: number;
};

export type MailThreadListItem = {
  id: MailThreadId;
  accountId: MailAccountId;
  providerThreadId: string;
  from: MailAddressView | null;
  subject: string | null;
  snippet: string;
  lastMessageAt: number;
  messageCount: number;
  hasUnread: boolean;
  hasAttachments: boolean;
  isTrashed: boolean;
  labels: MailLabelView[];
};

export type MailAttachmentView = {
  id: MailAttachmentId;
  messageId: MailMessageId;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadedAt: number | null;
};

export type MailMessageView = {
  id: MailMessageId;
  accountId: MailAccountId;
  threadId: MailThreadId;
  providerMessageId: string;
  from: MailAddressView | null;
  to: MailAddressView[];
  cc: MailAddressView[];
  bcc: MailAddressView[];
  subject: string | null;
  snippet: string;
  internalDate: number;
  isUnread: boolean;
  isDraft: boolean;
  isTrashed: boolean;
  hydration: MailHydration;
  bodyText: string | null;
  bodyHtml: string | null;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  labels: MailLabelView[];
  attachments: MailAttachmentView[];
};

export type MailThreadDetail = MailThreadListItem & { messages: MailMessageView[] };

export type MailDraftView = {
  id: MailDraftId;
  accountId: MailAccountId;
  providerDraftId: string | null;
  to: MailAddressView[];
  cc: MailAddressView[];
  bcc: MailAddressView[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  inReplyToMessageId: MailMessageId | null;
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
};
