import { MailIcon } from 'lucide-react';

import type { MailAccountView } from '@stitch/shared/mail/types';

import { MailAccountCard } from './mail-account-card.js';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { MailSyncStatusView } from '@/lib/queries/mail';

function getStatusForAccount(account: MailAccountView, statuses: MailSyncStatusView[] | undefined): MailSyncStatusView {
  const status = statuses?.find((item) => item.accountId === account.id);
  return {
    accountId: account.id,
    syncPhase: status?.syncPhase ?? account.syncPhase,
    progress: status?.progress,
    lastSyncedAt: status ? status.lastSyncedAt : account.lastSyncedAt,
    lastError: status ? status.lastError : account.lastError,
  };
}

export function EnrolledAccountsSection({
  accounts,
  statuses,
}: {
  accounts: MailAccountView[];
  statuses: MailSyncStatusView[] | undefined;
}) {
  if (accounts.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No mail accounts enrolled</EmptyTitle>
          <EmptyDescription>Enroll a connected Google account below to start syncing mail locally.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-2">
      {accounts.map((account) => (
        <MailAccountCard key={account.id} account={account} status={getStatusForAccount(account, statuses)} />
      ))}
    </div>
  );
}
