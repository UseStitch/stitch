import { PaperclipIcon } from 'lucide-react';
import * as React from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { MailAccountId, MailLabelId, MailThreadId, MailThreadListItem } from '@stitch/shared/mail/types';

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
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatSender(thread: MailThreadListItem): string {
  const sender = thread.from?.name || thread.from?.email || 'Mail';
  return thread.messageCount > 1 ? `${sender} · ${thread.messageCount}` : sender;
}

function ThreadRow({ thread, active, onClick }: { thread: MailThreadListItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/60',
        active && 'bg-muted',
        thread.hasUnread && 'bg-primary/5',
      )}>
      <div className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-sm', thread.hasUnread && 'font-semibold')}>
          {formatSender(thread)}
        </span>
        {thread.hasAttachments ? <PaperclipIcon className="size-3.5 text-muted-foreground" /> : null}
        <span className="shrink-0 text-xs text-muted-foreground">{formatThreadDate(thread.lastMessageAt)}</span>
      </div>
      <div className={cn('truncate text-sm', thread.hasUnread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
        {thread.subject || '(No subject)'}
      </div>
      <div className="line-clamp-2 text-xs text-muted-foreground">{thread.snippet}</div>
    </button>
  );
}

export function ThreadList({ accountId, labelId, selectedThreadId, onSelectThread }: ThreadListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery(mailThreadsInfiniteQueryOptions(accountId, labelId));
  const threads = query.data?.pages.flatMap((page) => page.threads) ?? [];
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
    overscan: 8,
  });

  React.useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !query.hasNextPage || query.isFetchingNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void query.fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [query]);

  if (query.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading threads…</div>;
  }

  if (threads.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No messages in this label.</div>;
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
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
      <div ref={loadMoreRef} className="flex justify-center p-3">
        {query.hasNextPage ? (
          <Button variant="ghost" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
