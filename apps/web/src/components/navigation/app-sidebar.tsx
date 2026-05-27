import {
  Loader2Icon,
  MessageCircleIcon,
  MessageSquareIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import * as React from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useParams, useRouterState } from '@tanstack/react-router';

import { AgendaSidebarContent } from '@/components/agenda/agenda-sidebar';
import { AnimatedTitle } from '@/components/animated-title';
import { AutomationsSidebarContent } from '@/components/automations/automations-sidebar';
import { RecordingsSidebarContent } from '@/components/recordings/recordings-sidebar';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarInput,
} from '@/components/ui/sidebar';
import { useSessionTitleUpdates } from '@/hooks/sse/use-session-title-updates';
import { useStreamingSessionIds } from '@/hooks/use-session-stream-state';
import { sessionsInfiniteQueryOptions } from '@/lib/queries/chat';
import { cn } from '@/lib/utils';

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

function ChatSidebarContent() {
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search.trim());
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    sessionsInfiniteQueryOptions(deferredSearch),
  );
  useSessionTitleUpdates();
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
      <SidebarHeader>
        <SidebarMenuButton
          render={<Link to="/" className="flex items-center justify-center gap-2 font-medium" />}
        >
          <PlusIcon className="size-4" />
          New Chat
        </SidebarMenuButton>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sessions.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sessions.map((session) => {
                  const isStreaming = streamingIdSet.has(session.id);
                  const isUnread = session.isUnread && session.id !== currentId && !isStreaming;
                  return (
                    <SidebarMenuItem key={session.id}>
                      <SidebarMenuButton
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
                        <AnimatedTitle
                          title={session.title ?? 'New conversation'}
                          className={cn('truncate', isUnread && 'font-semibold')}
                        />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
              {hasNextPage ? (
                <div ref={loadMoreRef} className="flex h-9 items-center justify-center">
                  {isFetchingNextPage ? (
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <MessageCircleIcon className="size-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                {deferredSearch ? 'No matching conversations' : 'No conversations yet'}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {deferredSearch ? 'Try a different search' : 'Start a new chat to get going'}
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </>
  );
}

function useActiveContext():
  | 'chat'
  | 'connectors'
  | 'automations'
  | 'memories'
  | 'usage'
  | 'recordings'
  | 'agenda' {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path.startsWith('/connectors')) return 'connectors';
  if (path.startsWith('/automations')) return 'automations';
  if (path.startsWith('/memories')) return 'memories';
  if (path.startsWith('/usage')) return 'usage';
  if (path.startsWith('/recordings')) return 'recordings';
  if (path.startsWith('/agenda')) return 'agenda';

  return 'chat';
}

export function AppSidebar() {
  const context = useActiveContext();

  if (context === 'connectors' || context === 'memories' || context === 'usage') {
    return null;
  }

  const content =
    context === 'automations' ? (
      <AutomationsSidebarContent />
    ) : context === 'recordings' ? (
      <RecordingsSidebarContent />
    ) : context === 'agenda' ? (
      <AgendaSidebarContent />
    ) : (
      <ChatSidebarContent />
    );

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      {content}
    </Sidebar>
  );
}
