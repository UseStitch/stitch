import { Loader2Icon, MessageCircleIcon, MessageSquareIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import type { SessionsPage } from '@stitch/shared/chat/messages';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { useStreamingSessionIds } from '@/hooks/use-session-stream-state';
import { sessionsInfiniteQueryOptions } from '@/lib/queries/chat';
import { cn } from '@/lib/utils';

type SidebarSession = {
  id: string;
  title: string | null;
  isUnread: boolean;
};

const selectSidebarSessions = (data: InfiniteData<SessionsPage>) => ({
  ...data,
  pages: data.pages.map((page) => ({
    ...page,
    sessions: page.sessions.map(
      ({ id, title, isUnread }) => ({ id, title, isUnread }) as SidebarSession,
    ),
  })),
});

const SessionStatusIcon = React.memo(function SessionStatusIcon({
  isStreaming,
  isUnread,
}: {
  isStreaming: boolean;
  isUnread: boolean;
}) {
  if (isStreaming) {
    return (
      <div className="flex size-3.5 shrink-0 items-center justify-center">
        <div className="size-2 animate-pulse rounded-full bg-primary" />
      </div>
    );
  }

  if (isUnread) {
    return (
      <div className="flex size-3.5 shrink-0 items-center justify-center">
        <div className="size-2 rounded-full bg-primary" />
      </div>
    );
  }

  return <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />;
});

export function ChatSidebarContent() {
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search.trim());
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...sessionsInfiniteQueryOptions(deferredSearch),
    select: selectSidebarSessions,
  });
  const streamingIds = useStreamingSessionIds();
  const streamingIdSet = React.useMemo(() => new Set(streamingIds), [streamingIds]);
  const sessions = data?.pages.flatMap((page) => page.sessions) ?? [];

  const params = useParams({ strict: false });
  const currentId = params.id;

  React.useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <>
      <InternalSidebar.Header className="pb-2">
        <InternalSidebar.Top>
          <InternalSidebar.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1"
          />
          <InternalSidebar.TopAction render={<Link to="/" />} aria-label="New chat">
            <PlusIcon className="size-3.5" />
          </InternalSidebar.TopAction>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        {sessions.length > 0 ? (
          <InternalSidebar.Group title="Recent">
            <InternalSidebar.List>
              {sessions.map((session) => {
                const isStreaming = streamingIdSet.has(session.id);
                const isUnread = session.isUnread && session.id !== currentId && !isStreaming;
                return (
                  <InternalSidebar.Item
                    key={session.id}
                    isActive={session.id === currentId}
                    render={
                      <Link
                        to="/session/$id"
                        params={{ id: session.id }}
                        viewTransition
                        className="flex items-center gap-2 truncate"
                      />
                    }
                  >
                    <SessionStatusIcon isStreaming={isStreaming} isUnread={isUnread} />
                    <span className={cn('truncate', isUnread && 'font-semibold')}>
                      {session.title ?? 'New conversation'}
                    </span>
                  </InternalSidebar.Item>
                );
              })}
            </InternalSidebar.List>
            {hasNextPage ? (
              <div ref={loadMoreRef} className="flex h-9 items-center justify-center">
                {isFetchingNextPage ? (
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            ) : null}
          </InternalSidebar.Group>
        ) : (
          <InternalSidebar.EmptyState
            icon={MessageCircleIcon}
            title={deferredSearch ? 'No matching conversations' : 'No conversations yet'}
            description={
              deferredSearch ? 'Try a different search' : 'Start a new chat to get going'
            }
          />
        )}
      </InternalSidebar.Content>
    </>
  );
}
