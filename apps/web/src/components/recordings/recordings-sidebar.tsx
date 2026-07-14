import { LibraryIcon, MicIcon } from 'lucide-react';
import * as React from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import {
  formatReadableDuration,
  formatRecordingShortDate,
  formatRecordingTime,
  getRecordingDisplayTitle,
} from './shared/formatting';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { recordingsInfiniteQueryOptions } from '@/lib/queries/recordings';

export function RecordingsSidebarContent() {
  const params = useParams({ strict: false });
  const selectedRecordingId = typeof params.id === 'string' ? params.id : null;
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(recordingsInfiniteQueryOptions());
  const recordings = data?.pages.flatMap((page) => page.recordings) ?? [];

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
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <Link to="/recordings" className="flex min-w-0 items-center gap-2 truncate">
              <LibraryIcon className="size-4 shrink-0" />
              <span className="truncate">Recordings</span>
            </Link>
          </InternalSidebar.TopTitle>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        {recordings.length > 0 ? (
          <InternalSidebar.Group title="Recent">
            <InternalSidebar.List>
              {recordings.map((recording) => {
                const displayTitle = getRecordingDisplayTitle(recording);
                const isAnalyzed = recording.analysisTitle !== null;
                return (
                  <InternalSidebar.Item
                    key={recording.id}
                    isActive={recording.id === selectedRecordingId}
                    className="h-auto py-1.5"
                    render={
                      <Link to="/recordings/$id" params={{ id: recording.id }} className="flex items-center gap-2" />
                    }>
                    <MicIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{displayTitle}</span>
                        <span className="shrink-0 text-2xs text-muted-foreground">
                          {formatRecordingShortDate(recording.startedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                        <span>
                          {formatReadableDuration(recording.durationMs)}
                          {' · '}
                          <span className={isAnalyzed ? 'text-success' : undefined}>
                            {isAnalyzed ? 'Analyzed' : 'Not analyzed'}
                          </span>
                        </span>
                        <span>{formatRecordingTime(recording.startedAt)}</span>
                      </div>
                    </div>
                  </InternalSidebar.Item>
                );
              })}
            </InternalSidebar.List>
            {hasNextPage ? (
              <div ref={loadMoreRef} className="flex h-9 items-center justify-center">
                {isFetchingNextPage ? <Spinner className="text-muted-foreground" /> : null}
              </div>
            ) : null}
          </InternalSidebar.Group>
        ) : (
          <Empty size="compact">
            <EmptyMedia>
              <MicIcon className="size-8 text-muted-foreground/40" />
            </EmptyMedia>
            <EmptyTitle>No recordings yet</EmptyTitle>
            <EmptyDescription>Start a recording to capture meeting audio.</EmptyDescription>
          </Empty>
        )}
      </InternalSidebar.Content>
    </>
  );
}
