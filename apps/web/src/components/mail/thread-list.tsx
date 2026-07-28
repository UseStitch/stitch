import { PaperclipIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { MailAccountId, MailLabelId, MailThreadId, MailThreadListItem } from '@stitch/shared/mail/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { mailThreadsInfiniteQueryOptions } from '@/lib/queries/mail';
import { cn } from '@/lib/utils';

type ThreadListProps = {
  accountId: MailAccountId;
  labelId: MailLabelId | null;
  selectedThreadId: MailThreadId | null;
  onSelectThread: (threadId: MailThreadId) => void;
};

function formatThreadDate(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatSender(thread: MailThreadListItem): string {
  const sender = thread.from?.name || thread.from?.email || 'Mail';
  return thread.messageCount > 1 ? `${sender} · ${thread.messageCount}` : sender;
}

function ThreadRow({ thread, active, onClick }: { thread: MailThreadListItem; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto w-full flex-col items-stretch justify-start gap-space-xs rounded-none border-b border-sidebar-border px-space-l py-space-l text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
        thread.hasUnread && 'bg-sidebar-accent',
      )}>
      <Stack direction="row" align="center" gap="m">
        <div className="min-w-0 flex-1">
          <Text as="span" variant={thread.hasUnread ? 'body-strong' : 'body'} truncate>
            {formatSender(thread)}
          </Text>
        </div>
        {thread.hasAttachments ? <Icon as={PaperclipIcon} size="s" color="var(--muted-foreground)" /> : null}
        <Text as="span" variant="caption" tone="muted">
          {formatThreadDate(thread.lastMessageAt)}
        </Text>
      </Stack>
      <div
        className={cn(
          'truncate text-sm',
          thread.hasUnread ? 'font-medium text-sidebar-foreground' : 'text-muted-foreground',
        )}>
        {thread.subject || '(No subject)'}
      </div>
      <div className="line-clamp-2 text-xs text-muted-foreground">{thread.snippet}</div>
    </Button>
  );
}

export function ThreadList({ accountId, labelId, selectedThreadId, onSelectThread }: ThreadListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    mailThreadsInfiniteQueryOptions(accountId, labelId),
  );
  const threads = data.pages.flatMap((page) => page.threads);
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
    overscan: 8,
  });

  React.useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (threads.length === 0) {
    return <div className="p-space-xl text-sm text-muted-foreground">No messages in this label.</div>;
  }

  return (
    <div ref={parentRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const thread = threads[virtualRow.index];
          if (!thread) return null;

          return (
            <div
              key={thread.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}>
              <ThreadRow
                thread={thread}
                active={thread.id === selectedThreadId}
                onClick={() => onSelectThread(thread.id)}
              />
            </div>
          );
        })}
      </div>
      <Stack ref={loadMoreRef} direction="row" justify="center" padding="l">
        {hasNextPage ? (
          <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </Stack>
    </div>
  );
}
