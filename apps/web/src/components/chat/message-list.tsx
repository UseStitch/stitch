import { useMemo, useRef, useCallback } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { Message } from '@stitch/shared/chat/messages';

import { RowContent } from '@/components/chat/message-list/row-content';
import { ALWAYS_UNVIRTUALIZED_TAIL_ROWS, buildRows, estimateRowHeight } from '@/components/chat/message-list/rows';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { useInfiniteLoadObserver } from '@/hooks/use-infinite-load-observer';
import type { SessionStreamState } from '@/stores/stream-store';

type MessageListProps = {
  messages: Message[];
  streamState: SessionStreamState;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onAbortTool?: () => void;
  onSplit?: (msgId: string) => void;
  onEdit?: (msgId: string) => void;
};

export function MessageList({
  messages,
  streamState,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onAbortTool,
  onSplit,
  onEdit,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => buildRows(messages, streamState, hasMore, isFetchingMore),
    [messages, streamState, hasMore, isFetchingMore],
  );

  const hasStreamContent = streamState.isStreaming || streamState.partIds.length > 0 || streamState.error !== null;

  const sentinelRef = useInfiniteLoadObserver({ hasMore, isLoading: isFetchingMore, onLoadMore, threshold: 0.1 });

  const firstUnvirtualizedRowIndex = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
  const virtualizedRowCount = Math.min(firstUnvirtualizedRowIndex, rows.length);

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => parentRef.current,
    getItemKey: useCallback(
      (index: number) => {
        const row = rows[index];
        if (row.kind === 'streaming') return 'streaming';
        if (row.kind === 'error') return 'error';
        if (row.kind === 'load-more') return 'load-more';
        return row.id;
      },
      [rows],
    ),
    estimateSize: useCallback(
      (index: number) => {
        const row = rows[index];
        return estimateRowHeight(row);
      },
      [rows],
    ),
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);

  return (
    <div ref={parentRef} className="flex flex-col gap-space-2xl py-space-xl">
      {virtualizedRowCount > 0 && (
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];

            const rowKey =
              row.kind === 'streaming' || row.kind === 'error' || row.kind === 'load-more'
                ? `virtual-${row.kind}`
                : `virtual-${row.id}`;

            return (
              <div
                key={rowKey}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}>
                <RowContent
                  row={row}
                  streamState={streamState}
                  isFetchingMore={isFetchingMore}
                  onLoadMore={onLoadMore}
                  onAbortTool={onAbortTool}
                  onSplit={onSplit}
                  onEdit={onEdit}
                  sentinelRef={sentinelRef}
                />
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row) => {
        const rowKey =
          row.kind === 'streaming' || row.kind === 'error' || row.kind === 'load-more'
            ? `tail-${row.kind}`
            : `tail-${row.id}`;

        return (
          <div key={rowKey}>
            <RowContent
              row={row}
              streamState={streamState}
              isFetchingMore={isFetchingMore}
              onLoadMore={onLoadMore}
              onAbortTool={onAbortTool}
              onSplit={onSplit}
              onEdit={onEdit}
              sentinelRef={sentinelRef}
            />
          </div>
        );
      })}

      {!hasStreamContent && messages.length === 0 && (
        <Stack direction="row" justify="start">
          <Text as="div" variant="body" tone="muted">
            Start a conversation...
          </Text>
        </Stack>
      )}
    </div>
  );
}
