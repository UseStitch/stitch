import { EditIcon, MailIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { MailAccountId, MailLabelId, MailThreadId } from '@stitch/shared/mail/types';

import { Composer } from '@/components/mail/composer';
import { useMailStore } from '@/components/mail/mail-store';
import { ThreadList } from '@/components/mail/thread-list';
import { ThreadView } from '@/components/mail/thread-view';
import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Icon } from '@/components/primitives/icon';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getDefaultMailLabel, mailAccountsQueryOptions, mailLabelsQueryOptions } from '@/lib/queries/mail';

export function MailPage() {
  const { selectedAccountId, selectedLabelId } = useMailStore();
  const { data: accounts } = useSuspenseQuery(mailAccountsQueryOptions);
  const accountId = selectedAccountId ?? accounts[0]?.id ?? null;

  if (!accountId) return <NoMailAccounts />;

  return <MailPageContent accountId={accountId} selectedLabelId={selectedLabelId} />;
}

function NoMailAccounts() {
  return (
    <div className="flex h-full items-center justify-center p-space-3xl">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No mail accounts</EmptyTitle>
          <EmptyDescription>Enroll a Gmail account in Settings to use Mail.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function MailPageContent({
  accountId,
  selectedLabelId,
}: {
  accountId: MailAccountId;
  selectedLabelId: MailLabelId | null;
}) {
  const { data: labels } = useSuspenseQuery(mailLabelsQueryOptions(accountId));
  const labelId = selectedLabelId ?? getDefaultMailLabel(labels)?.id ?? null;
  const [selectedThreadId, setSelectedThreadId] = React.useState<MailThreadId | null>(null);
  const [composerOpen, setComposerOpen] = React.useState(false);

  const scope = `${accountId}:${labelId}`;
  const [previousScope, setPreviousScope] = React.useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelectedThreadId(null);
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex w-(--sidebar-width) min-w-80 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <InternalSidebar.Header>
          <InternalSidebar.Top>
            <InternalSidebar.TopTitle>Threads</InternalSidebar.TopTitle>
            <InternalSidebar.TopAction onClick={() => setComposerOpen(true)} aria-label="Compose mail">
              <Icon as={EditIcon} size="s" />
            </InternalSidebar.TopAction>
          </InternalSidebar.Top>
        </InternalSidebar.Header>
        <ThreadList
          accountId={accountId}
          labelId={labelId}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
        />
      </div>
      <div className="min-w-0 flex-1">
        {selectedThreadId ? (
          <ThreadView accountId={accountId} threadId={selectedThreadId} onClose={() => setSelectedThreadId(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-space-3xl">
            <Empty>
              <EmptyContent>
                <EmptyHeader>
                  <EmptyMedia>
                    <MailIcon />
                  </EmptyMedia>
                  <EmptyTitle>Select a thread</EmptyTitle>
                  <EmptyDescription>Choose a message from the list to read it.</EmptyDescription>
                </EmptyHeader>
              </EmptyContent>
            </Empty>
          </div>
        )}
      </div>
      {composerOpen ? <Composer accountId={accountId} onClose={() => setComposerOpen(false)} /> : null}
    </div>
  );
}
