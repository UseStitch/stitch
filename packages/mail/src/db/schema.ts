import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { PrefixedString } from '@stitch/shared/id';

export type MailAccountId = PrefixedString<'macc'>;
export type MailLabelId = PrefixedString<'mlbl'>;
export type MailThreadId = PrefixedString<'mthr'>;
export type MailMessageId = PrefixedString<'mmsg'>;
export type MailAttachmentId = PrefixedString<'matt'>;
export type MailDraftId = PrefixedString<'mdrf'>;
export type MailOutboxId = PrefixedString<'mob'>;

export type MailProviderId = 'gmail';
export type MailSyncPhase = 'idle' | 'backfill' | 'incremental' | 'reconciling' | 'error';
export type MailLabelKind = 'system' | 'user';
export type MailHydration = 'metadata' | 'full';
export type MailOutboxOpType =
  | 'send'
  | 'send_draft'
  | 'trash_thread'
  | 'untrash_thread'
  | 'modify_labels'
  | 'create_draft'
  | 'update_draft'
  | 'delete_draft';
export type MailOutboxStatus = 'pending' | 'in_flight' | 'failed' | 'done';

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function randomBase62(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) result += ID_CHARS[bytes[i] % ID_CHARS.length];
  return result;
}

function createMailId<P extends string>(prefix: P): PrefixedString<P> {
  return `${prefix}_${Date.now().toString(16)}${randomBase62(14)}` as PrefixedString<P>;
}

export const createMailAccountId = () => createMailId('macc');
export const createMailLabelId = () => createMailId('mlbl');
export const createMailThreadId = () => createMailId('mthr');
export const createMailMessageId = () => createMailId('mmsg');
export const createMailAttachmentId = () => createMailId('matt');
export const createMailDraftId = () => createMailId('mdrf');
export const createMailOutboxId = () => createMailId('mob');

export const mailAccounts = sqliteTable(
  'mail_accounts',
  {
    id: text('id').$type<MailAccountId>().primaryKey().$defaultFn(createMailAccountId),
    connectorInstanceId: text('connector_instance_id').notNull(),
    provider: text('provider').$type<MailProviderId>().notNull(),
    email: text('email').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    syncPhase: text('sync_phase').$type<MailSyncPhase>().notNull().default('idle'),
    syncCursor: text('sync_cursor'),
    backfillCursor: text('backfill_cursor'),
    lastSyncedAt: integer('last_synced_at', { mode: 'number' }),
    lastError: text('last_error'),
    syncFrequencySeconds: integer('sync_frequency_seconds').notNull().default(90),
    backfillDays: integer('backfill_days').notNull().default(30),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('mail_accounts_connector_instance_id_uidx').on(table.connectorInstanceId),
    check('mail_accounts_provider_check', sql`${table.provider} in ('gmail')`),
    check(
      'mail_accounts_sync_phase_check',
      sql`${table.syncPhase} in ('idle', 'backfill', 'incremental', 'reconciling', 'error')`,
    ),
  ],
);

export const mailLabels = sqliteTable(
  'mail_labels',
  {
    id: text('id').$type<MailLabelId>().primaryKey().$defaultFn(createMailLabelId),
    accountId: text('account_id')
      .$type<MailAccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerLabelId: text('provider_label_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<MailLabelKind>().notNull(),
    color: text('color'),
    unreadCount: integer('unread_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('mail_labels_account_provider_label_uidx').on(table.accountId, table.providerLabelId),
    index('mail_labels_account_id_idx').on(table.accountId),
    check('mail_labels_kind_check', sql`${table.kind} in ('system', 'user')`),
  ],
);

export const mailThreads = sqliteTable(
  'mail_threads',
  {
    id: text('id').$type<MailThreadId>().primaryKey().$defaultFn(createMailThreadId),
    accountId: text('account_id')
      .$type<MailAccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject'),
    snippet: text('snippet').notNull().default(''),
    lastMessageAt: integer('last_message_at', { mode: 'number' }).notNull(),
    messageCount: integer('message_count').notNull().default(0),
    hasUnread: integer('has_unread', { mode: 'boolean' }).notNull().default(false),
    hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
    isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('mail_threads_account_provider_thread_uidx').on(table.accountId, table.providerThreadId),
    index('mail_threads_account_trashed_last_message_idx').on(table.accountId, table.isTrashed, table.lastMessageAt),
  ],
);

export const mailMessages = sqliteTable(
  'mail_messages',
  {
    id: text('id').$type<MailMessageId>().primaryKey().$defaultFn(createMailMessageId),
    accountId: text('account_id')
      .$type<MailAccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .$type<MailThreadId>()
      .notNull()
      .references(() => mailThreads.id, { onDelete: 'cascade' }),
    providerMessageId: text('provider_message_id').notNull(),
    fromJson: text('from_json').notNull(),
    toJson: text('to_json').notNull(),
    ccJson: text('cc_json').notNull(),
    bccJson: text('bcc_json').notNull(),
    subject: text('subject'),
    snippet: text('snippet').notNull().default(''),
    internalDate: integer('internal_date', { mode: 'number' }).notNull(),
    isUnread: integer('is_unread', { mode: 'boolean' }).notNull().default(false),
    isDraft: integer('is_draft', { mode: 'boolean' }).notNull().default(false),
    isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
    hydration: text('hydration').$type<MailHydration>().notNull(),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    rfcMessageId: text('rfc_message_id'),
    inReplyTo: text('in_reply_to'),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('mail_messages_account_provider_message_uidx').on(table.accountId, table.providerMessageId),
    index('mail_messages_thread_internal_date_idx').on(table.threadId, table.internalDate),
    check('mail_messages_hydration_check', sql`${table.hydration} in ('metadata', 'full')`),
  ],
);

export const mailMessageLabels = sqliteTable(
  'mail_message_labels',
  {
    messageId: text('message_id')
      .$type<MailMessageId>()
      .notNull()
      .references(() => mailMessages.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .$type<MailLabelId>()
      .notNull()
      .references(() => mailLabels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.labelId] }),
    index('mail_message_labels_label_id_idx').on(table.labelId),
  ],
);

export const mailAttachments = sqliteTable(
  'mail_attachments',
  {
    id: text('id').$type<MailAttachmentId>().primaryKey().$defaultFn(createMailAttachmentId),
    messageId: text('message_id')
      .$type<MailMessageId>()
      .notNull()
      .references(() => mailMessages.id, { onDelete: 'cascade' }),
    providerAttachmentId: text('provider_attachment_id').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    localPath: text('local_path'),
    downloadedAt: integer('downloaded_at', { mode: 'number' }),
  },
  (table) => [index('mail_attachments_message_id_idx').on(table.messageId)],
);

export const mailDrafts = sqliteTable(
  'mail_drafts',
  {
    id: text('id').$type<MailDraftId>().primaryKey().$defaultFn(createMailDraftId),
    accountId: text('account_id')
      .$type<MailAccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerDraftId: text('provider_draft_id'),
    toJson: text('to_json').notNull(),
    ccJson: text('cc_json').notNull(),
    bccJson: text('bcc_json').notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    inReplyToMessageId: text('in_reply_to_message_id').$type<MailMessageId | null>(),
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index('mail_drafts_account_id_idx').on(table.accountId)],
);

export const mailOutbox = sqliteTable(
  'mail_outbox',
  {
    id: text('id').$type<MailOutboxId>().primaryKey().$defaultFn(createMailOutboxId),
    accountId: text('account_id')
      .$type<MailAccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    opType: text('op_type').$type<MailOutboxOpType>().notNull(),
    payloadJson: text('payload_json').notNull(),
    status: text('status').$type<MailOutboxStatus>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'number' }).notNull(),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('mail_outbox_account_status_next_attempt_idx').on(table.accountId, table.status, table.nextAttemptAt),
    check(
      'mail_outbox_op_type_check',
      sql`${table.opType} in ('send', 'send_draft', 'trash_thread', 'untrash_thread', 'modify_labels', 'create_draft', 'update_draft', 'delete_draft')`,
    ),
    check('mail_outbox_status_check', sql`${table.status} in ('pending', 'in_flight', 'failed', 'done')`),
  ],
);

export type MailAccountRecord = typeof mailAccounts.$inferSelect;
export type MailLabelRecord = typeof mailLabels.$inferSelect;
export type MailThreadRecord = typeof mailThreads.$inferSelect;
export type MailMessageRecord = typeof mailMessages.$inferSelect;
export type MailAttachmentRecord = typeof mailAttachments.$inferSelect;
export type MailDraftRecord = typeof mailDrafts.$inferSelect;
export type MailOutboxRecord = typeof mailOutbox.$inferSelect;
