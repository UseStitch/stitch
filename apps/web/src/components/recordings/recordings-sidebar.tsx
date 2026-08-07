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
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
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
      if (entries.at(0)?.isIntersecting && !isFetchingNextPage) {
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
            <Link to="/recordings" className="flex min-w-0 items-center gap-space-m truncate">
              <Icon as={LibraryIcon} size="m" />
              <Text as="span" variant="body" truncate>
                Recordings
              </Text>
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
                    className="h-auto py-space-s"
                    render={
                      <Link
                        to="/recordings/$id"
                        params={{ id: recording.id }}
                        className="flex items-center gap-space-m"
                      />
                    }>
                    <Icon as={MicIcon} size="s" color="var(--muted-foreground)" />
                    <div className="min-w-0 flex-1">
                      <Stack direction="row" align="center" justify="between" gap="m">
                        <Text as="span" variant="body" truncate>
                          {displayTitle}
                        </Text>
                        <div className="shrink-0">
                          <Text as="span" variant="micro" tone="muted">
                            {formatRecordingShortDate(recording.startedAt)}
                          </Text>
                        </div>
                      </Stack>
                      <Stack direction="row" align="center" justify="between" gap="m">
                        <Text as="span" variant="micro" tone="muted">
                          {formatReadableDuration(recording.durationMs)}
                          {' · '}
                          <Text as="span" variant="micro" tone={isAnalyzed ? 'success' : 'muted'}>
                            {isAnalyzed ? 'Analyzed' : 'Not analyzed'}
                          </Text>
                        </Text>
                        <Text as="span" variant="micro" tone="muted">
                          {formatRecordingTime(recording.startedAt)}
                        </Text>
                      </Stack>
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
            <EmptyMedia>
              <Icon as={MicIcon} size="l" color="var(--text-faint)" />
            </EmptyMedia>
            <EmptyTitle>No recordings yet</EmptyTitle>
            <EmptyDescription>Start a recording to capture meeting audio.</EmptyDescription>
          </Empty>
        )}
      </InternalSidebar.Content>
    </>
  );
}
