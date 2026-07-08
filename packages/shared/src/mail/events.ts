import type { MailAccountId, MailThreadId, MailSyncPhase } from './types.js';

export const MAIL_EVENT_NAMES = ['mail.sync.progress', 'mail.account.updated', 'mail.threads.changed'] as const;

export type MailEvents = {
  'mail.sync.progress': {
    accountId: MailAccountId;
    phase: Extract<MailSyncPhase, 'backfill' | 'reconciling'>;
    processed: number;
    estimatedTotal: number;
  };
  'mail.account.updated': { accountId: MailAccountId };
  'mail.threads.changed': { accountId: MailAccountId; threadIds: MailThreadId[] };
};
