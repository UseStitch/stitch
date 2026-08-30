import { LibraryIcon, MicIcon } from 'lucide-react';

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
import { InfiniteLoadTrigger } from '@/components/ui/infinite-load-trigger';
import { useInfiniteLoadObserver } from '@/hooks/use-infinite-load-observer';
import { recordingsInfiniteQueryOptions } from '@/lib/queries/recordings';

export function RecordingsSidebarContent() {
  const params = useParams({ strict: false });
  const selectedRecordingId = typeof params.id === 'string' ? params.id : null;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(recordingsInfiniteQueryOptions());
  const recordings = data?.pages.flatMap((page) => page.recordings) ?? [];

  const loadMoreRef = useInfiniteLoadObserver({
    hasMore: hasNextPage,
    isLoading: isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });

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
            {hasNextPage ? <InfiniteLoadTrigger sentinelRef={loadMoreRef} isLoading={isFetchingNextPage} /> : null}
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
