import { ChevronDownIcon, InboxIcon, MailIcon, SendIcon, TagIcon, TrashIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { MailAccountId, MailLabelView } from '@stitch/shared/mail/types';

import { useMailStore } from '@/components/mail/mail-store';
import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDefaultMailLabel, mailAccountsQueryOptions, mailLabelsQueryOptions } from '@/lib/queries/mail';
import { cn } from '@/lib/utils';

const SYSTEM_LABEL_ORDER = ['INBOX', 'SENT', 'DRAFT', 'DRAFTS', 'TRASH'] as const;

function getSystemIcon(label: MailLabelView) {
  const normalized = label.providerLabelId.toUpperCase();
  if (normalized === 'INBOX') return InboxIcon;
  if (normalized === 'SENT') return SendIcon;
  if (normalized === 'TRASH') return TrashIcon;
  return MailIcon;
}

function sortLabels(labels: MailLabelView[]): MailLabelView[] {
  return [...labels].sort((a, b) => {
    const aIndex = SYSTEM_LABEL_ORDER.findIndex((id) => id === a.providerLabelId.toUpperCase());
    const bIndex = SYSTEM_LABEL_ORDER.findIndex((id) => id === b.providerLabelId.toUpperCase());
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    if (a.kind !== b.kind) return a.kind === 'system' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function MailLabelList({ accountId }: { accountId: MailAccountId }) {
  const { selectedLabelId, setSelectedLabelId } = useMailStore();
  const { data: labels = [] } = useQuery(mailLabelsQueryOptions(accountId));
  const sortedLabels = React.useMemo(() => sortLabels(labels), [labels]);

  React.useEffect(() => {
    if (!selectedLabelId && labels.length > 0) setSelectedLabelId(getDefaultMailLabel(labels)?.id ?? null);
  }, [labels, selectedLabelId, setSelectedLabelId]);

  return (
    <InternalSidebar.Section title="Labels">
      {sortedLabels.map((label) => {
        const Icon = label.kind === 'system' ? getSystemIcon(label) : TagIcon;
        return (
          <InternalSidebar.SectionItem
            key={label.id}
            isActive={selectedLabelId === label.id}
            onClick={() => setSelectedLabelId(label.id)}
            className={cn('justify-start gap-2', label.unreadCount > 0 && 'font-medium')}>
            <Icon className="size-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{label.name}</span>
            {label.unreadCount > 0 ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {label.unreadCount}
              </Badge>
            ) : null}
          </InternalSidebar.SectionItem>
        );
      })}
    </InternalSidebar.Section>
  );
}

export function MailSidebarContent() {
  const { selectedAccountId, setSelectedAccountId } = useMailStore();
  const { data: accounts = [] } = useQuery(mailAccountsQueryOptions);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];

  React.useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId, setSelectedAccountId]);

  return (
    <InternalSidebar>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <MailIcon className="size-4" />
            <span>Mail</span>
          </InternalSidebar.TopTitle>
        </InternalSidebar.Top>
        {selectedAccount ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="mx-2 mb-2 min-w-0 justify-between"
                  aria-label="Switch mail account"
                />
              }>
              <span className="truncate">{selectedAccount.email}</span>
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              {accounts.map((account) => (
                <DropdownMenuItem key={account.id} onClick={() => setSelectedAccountId(account.id)}>
                  <span className="truncate">{account.email}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </InternalSidebar.Header>
      <InternalSidebar.Content>
        {!selectedAccount ? (
          <InternalSidebar.EmptyState
            icon={MailIcon}
            title="No mail accounts"
            description="Enroll an account in Settings."
          />
        ) : (
          <MailLabelList accountId={selectedAccount.id} />
        )}
      </InternalSidebar.Content>
    </InternalSidebar>
  );
}
