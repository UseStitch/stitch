import { EditIcon, MailIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { MailThreadId } from '@stitch/shared/mail/types';

import { Composer } from '@/components/mail/composer';
import { useMailStore } from '@/components/mail/mail-store';
import { ThreadList } from '@/components/mail/thread-list';
import { ThreadView } from '@/components/mail/thread-view';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { mailAccountsQueryOptions } from '@/lib/queries/mail';

export function MailPage() {
  const { selectedAccountId, selectedLabelId } = useMailStore();
  const { data: accounts = [] } = useQuery(mailAccountsQueryOptions);
  const accountId = selectedAccountId ?? accounts[0]?.id ?? null;
  const [selectedThreadId, setSelectedThreadId] = React.useState<MailThreadId | null>(null);
  const [composerOpen, setComposerOpen] = React.useState(false);

  React.useEffect(() => {
    setSelectedThreadId(null);
  }, [accountId, selectedLabelId]);

  if (!accountId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
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

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex w-96 min-w-80 flex-col border-r border-border">
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <div className="text-sm font-medium">Threads</div>
          <Button size="sm" onClick={() => setComposerOpen(true)}>
            <EditIcon className="size-3.5" />
            Compose
          </Button>
        </div>
        <ThreadList
          accountId={accountId}
          labelId={selectedLabelId}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
        />
      </div>
      <div className="min-w-0 flex-1">
        {selectedThreadId ? (
          <ThreadView accountId={accountId} threadId={selectedThreadId} onClose={() => setSelectedThreadId(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
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
