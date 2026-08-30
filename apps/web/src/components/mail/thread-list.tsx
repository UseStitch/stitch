import { cn } from 'cnfast';
import { PaperclipIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { MailAccountId, MailLabelId, MailThreadId, MailThreadListItem } from '@stitch/shared/mail/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { useInfiniteLoadObserver } from '@/hooks/use-infinite-load-observer';
import { mailThreadsInfiniteQueryOptions } from '@/lib/queries/mail';

type ThreadListProps = {
  accountId: MailAccountId;
  labelId: MailLabelId | null;
  selectedThreadId: MailThreadId | null;
  onSelectThread: (threadId: MailThreadId) => void;
};

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function formatThreadDate(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return TIME_FORMATTER.format(date);
  return DATE_FORMATTER.format(date);
}

function formatSender(thread: MailThreadListItem): string {
  const sender = thread.from?.name || thread.from?.email || 'Mail';
  return thread.messageCount > 1 ? `${sender} · ${thread.messageCount}` : sender;
}

function ThreadRow({ thread, active, onClick }: { thread: MailThreadListItem; active: boolean; onClick: () => void }) {
  return (
    <div
      className={cn(
        'border-b border-sidebar-border px-space-l py-space-l hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
        thread.hasUnread && 'bg-sidebar-accent',
      )}>
      <Button type="button" variant="ghost" size="inline" width="full" align="start" onClick={onClick}>
        <Stack width="full" gap="xs">
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
          <Text
            as="div"
            variant={thread.hasUnread ? 'body-strong' : 'body'}
            tone={thread.hasUnread ? 'default' : 'muted'}
            truncate>
            {thread.subject || '(No subject)'}
          </Text>
          <Text as="div" variant="caption" tone="muted" lineClamp="2">
            {thread.snippet}
          </Text>
        </Stack>
      </Button>
    </div>
  );
}

export function ThreadList({ accountId, labelId, selectedThreadId, onSelectThread }: ThreadListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
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

  const loadMoreRef = useInfiniteLoadObserver({
    hasMore: hasNextPage,
    isLoading: isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });

  if (threads.length === 0) {
    return (
      <div className="p-space-xl">
        <Text tone="muted">No messages in this label.</Text>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const thread = threads[virtualRow.index];

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
