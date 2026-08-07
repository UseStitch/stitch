import { ArchiveIcon, MessageCircleIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import type { SessionsPage } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { useStreamingSessionIds } from '@/hooks/use-session-stream-state';
import { sessionsInfiniteQueryOptions, useArchiveSession, useDeleteSession } from '@/lib/queries/chat';

type SidebarSession = { id: string; title: string | null; isUnread: boolean };

const selectSidebarSessions = (data: InfiniteData<SessionsPage>) => ({
  ...data,
  pages: data.pages.map((page) => ({
    ...page,
    sessions: page.sessions.map(({ id, title, isUnread }) => ({ id, title, isUnread }) as SidebarSession),
  })),
});

function SessionStatusIcon({ isStreaming, isUnread }: { isStreaming: boolean; isUnread: boolean }) {
  if (isStreaming) {
    return (
      <div className="flex size-3.5 shrink-0 items-center justify-center">
        <StatusDot color="primary" pulse />
      </div>
    );
  }

  if (isUnread) {
    return (
      <div className="flex size-3.5 shrink-0 items-center justify-center">
        <StatusDot color="primary" />
      </div>
    );
  }

  return null;
}

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
  const streamingIdSet = new Set(streamingIds);
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
      if (entries.at(0)?.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <>
      <InternalSidebar.Header className="pb-space-m">
        <InternalSidebar.Top>
          <InternalSidebar.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1"
          />
          <InternalSidebar.TopAction render={<Link to="/" />} aria-label="New chat">
            <Icon as={PlusIcon} size="s" />
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
                        className="flex items-center gap-space-m truncate pr-space-3xl"
                      />
                    }>
                    <SessionStatusIcon isStreaming={isStreaming} isUnread={isUnread} />
                    <Text as="span" variant={isUnread ? 'body-strong' : 'body'} truncate>
                      {session.title ?? 'New conversation'}
                    </Text>
                    <div className="absolute top-1.5 right-1 flex items-center gap-space-2xs opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100">
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
                        <Icon as={ArchiveIcon} size="s" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive-quiet"
                        size="icon-xs"
                        aria-label={`Delete ${session.title ?? 'conversation'}`}
                        disabled={archiveSession.isPending || deleteSession.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeletingSessionId(session.id);
                        }}>
                        <Icon as={Trash2Icon} size="s" />
                      </Button>
                    </div>
                  </InternalSidebar.Item>
                );
              })}
            </InternalSidebar.List>
            {hasNextPage ? (
              <div ref={loadMoreRef} className="flex h-9 items-center justify-center">
                {isFetchingNextPage ? <Spinner tone="muted" /> : null}
              </div>
            ) : null}
          </InternalSidebar.Group>
        ) : (
          <Empty size="compact">
            <EmptyMedia variant="icon">
              <Icon as={MessageCircleIcon} size="m" color="var(--text-faint)" />
            </EmptyMedia>
            <EmptyTitle>{deferredSearch ? 'No matching conversations' : 'No conversations yet'}</EmptyTitle>
            <EmptyDescription>
              {deferredSearch ? 'Try a different search' : 'Start a new chat to get going'}
            </EmptyDescription>
          </Empty>
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
