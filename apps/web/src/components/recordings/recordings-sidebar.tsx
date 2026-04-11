import { LibraryIcon, MicIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useRouterState } from '@tanstack/react-router';

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { recordingsQueryOptions } from '@/lib/queries/recordings';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '--';

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes} mins`;
  }

  return `${seconds} secs`;
}

export function RecordingsSidebarContent() {
  const params = useParams({ strict: false });
  const routerState = useRouterState();
  const selectedRecordingId = typeof params.id === 'string' ? params.id : null;
  const isOnIndex = routerState.location.pathname === '/recordings';

  const { data } = useQuery(recordingsQueryOptions({ page: 1, pageSize: 100 }));
  const recordings = data?.recordings ?? [];

  return (
    <>
      <SidebarHeader className="pb-0">
        <SidebarMenuButton
          isActive={isOnIndex}
          render={<Link to="/recordings" className="flex items-center gap-2 font-medium" />}
        >
          <LibraryIcon className="size-4" />
          All Recordings
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        {recordings.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recordings.map((recording) => {
                  const displayTitle = recording.analysisTitle || recording.title;
                  const isAnalyzed = recording.analysisTitle !== null;
                  return (
                    <SidebarMenuItem key={recording.id}>
                      <SidebarMenuButton
                        isActive={recording.id === selectedRecordingId}
                        className="h-auto py-1.5"
                        render={
                          <Link
                            to="/recordings/$id"
                            params={{ id: recording.id }}
                            className="flex items-center gap-2"
                          />
                        }
                      >
                        <MicIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm">{displayTitle}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatDate(recording.startedAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                            <span>
                              {formatDuration(recording.durationMs)}
                              {' · '}
                              <span className={isAnalyzed ? 'text-success' : undefined}>
                                {isAnalyzed ? 'Analyzed' : 'Not analyzed'}
                              </span>
                            </span>
                            <span>{formatTime(recording.startedAt)}</span>
                          </div>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <MicIcon className="size-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No recordings yet</p>
              <p className="text-xs text-muted-foreground/70">
                Start a recording to capture meeting audio.
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </>
  );
}
