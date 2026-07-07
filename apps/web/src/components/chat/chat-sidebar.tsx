import { ArchiveIcon, Loader2Icon, MessageCircleIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import type { SessionsPage } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStreamingSessionIds } from '@/hooks/use-session-stream-state';
import { sessionsInfiniteQueryOptions, useArchiveSession, useDeleteSession } from '@/lib/queries/chat';
import { cn } from '@/lib/utils';

type SidebarSession = { id: string; title: string | null; isUnread: boolean };

const selectSidebarSessions = (data: InfiniteData<SessionsPage>) => ({
  ...data,
  pages: data.pages.map((page) => ({
    ...page,
    sessions: page.sessions.map(({ id, title, isUnread }) => ({ id, title, isUnread }) as SidebarSession),
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

  return null;
});

export function ChatSidebarContent() {
  const [search, setSearch] = React.useState('');
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null);
  const deferredSearch = React.useDeferredValue(search.trim());
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...sessionsInfiniteQueryOptions(deferredSearch),
    select: selectSidebarSessions,
  });
  const archiveSession = useArchiveSession();
  const deleteSession = useDeleteSession();
  const streamingIds = useStreamingSessionIds();
  const streamingIdSet = React.useMemo(() => new Set(streamingIds), [streamingIds]);
  const sessions = data?.pages.flatMap((page) => page.sessions) ?? [];
  const deletingSession = sessions.find((session) => session.id === deletingSessionId);

  const params = useParams({ strict: false });
  const currentId = params.id;

  async function handleArchiveSession(sessionId: string) {
    await archiveSession.mutateAsync({ sessionId: sessionId as PrefixedString<'ses'> });
    if (sessionId === currentId) {
      void navigate({ to: '/' });
    }
  }

  async function handleDeleteSession() {
    if (!deletingSessionId) return;
    await deleteSession.mutateAsync({ sessionId: deletingSessionId as PrefixedString<'ses'> });
    setDeletingSessionId(null);
    if (deletingSessionId === currentId) {
      void navigate({ to: '/' });
    }
  }

  async function handleArchiveDeletingSession() {
    if (!deletingSessionId) return;
    await handleArchiveSession(deletingSessionId);
    setDeletingSessionId(null);
  }

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
                        className="flex items-center gap-2 truncate pr-14"
                      />
                    }>
                    <SessionStatusIcon isStreaming={isStreaming} isUnread={isUnread} />
                    <span className={cn('truncate', isUnread && 'font-semibold')}>
                      {session.title ?? 'New conversation'}
                    </span>
                    <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Archive ${session.title ?? 'conversation'}`}
                        disabled={archiveSession.isPending || deleteSession.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleArchiveSession(session.id);
                        }}>
                        <ArchiveIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${session.title ?? 'conversation'}`}
                        disabled={archiveSession.isPending || deleteSession.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeletingSessionId(session.id);
                        }}>
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </InternalSidebar.Item>
                );
              })}
            </InternalSidebar.List>
            {hasNextPage ? (
              <div ref={loadMoreRef} className="flex h-9 items-center justify-center">
                {isFetchingNextPage ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
            ) : null}
          </InternalSidebar.Group>
        ) : (
          <InternalSidebar.EmptyState
            icon={MessageCircleIcon}
            title={deferredSearch ? 'No matching conversations' : 'No conversations yet'}
            description={deferredSearch ? 'Try a different search' : 'Start a new chat to get going'}
          />
        )}
      </InternalSidebar.Content>

      <ConfirmDialog
        open={deletingSessionId !== null}
        onOpenChange={(open) => setDeletingSessionId(open ? deletingSessionId : null)}
        title={`Delete ${deletingSession?.title ?? 'session'}?`}
        description="This permanently deletes the session, messages, and usage data. You can archive it instead."
        onConfirm={() => void handleDeleteSession()}
        onSecondaryAction={() => void handleArchiveDeletingSession()}
        confirmLabel="Delete session"
        secondaryActionLabel="Archive instead"
        isPending={deleteSession.isPending}
        isSecondaryPending={archiveSession.isPending}
        contentClassName="max-w-sm"
      />
    </>
  );
}
