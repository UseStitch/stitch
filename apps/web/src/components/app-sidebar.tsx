import { PlusIcon, MessageSquareIcon, MessageCircleIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { AnimatedTitle } from '@/components/animated-title';
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
} from '@/components/ui/sidebar';
import { useSessionTitleUpdates } from '@/hooks/sse/use-session-title-updates';
import { useStreamingSessionIds } from '@/hooks/use-session-stream-state';
import { sessionsQueryOptions } from '@/lib/queries/chat';
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
      <div className="size-3.5 shrink-0 flex items-center justify-center">
        <div className="size-2 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }

  if (isUnread) {
    return (
      <div className="size-3.5 shrink-0 flex items-center justify-center">
        <div className="size-2 rounded-full bg-primary" />
      </div>
    );
  }

  return <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />;
});

export function AppSidebar() {
  const { data: sessions } = useQuery(sessionsQueryOptions);
  useSessionTitleUpdates();
  const streamingIds = useStreamingSessionIds();
  const streamingIdSet = React.useMemo(() => new Set(streamingIds), [streamingIds]);

  const params = useParams({ strict: false }) as { id?: string };
  const currentId = params.id;

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      <SidebarHeader className="pb-0">
        <SidebarMenuButton
          render={<Link to="/" className="flex items-center justify-center gap-2 font-medium" />}
        >
          <PlusIcon className="size-4" />
          New Chat
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        {sessions && sessions.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[...sessions].reverse().map((session) => {
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
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <MessageCircleIcon className="size-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground/70">Start a new chat to get going</p>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
