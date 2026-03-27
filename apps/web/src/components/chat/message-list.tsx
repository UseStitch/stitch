import { useMemo, useRef, useCallback, useEffect } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { Message } from '@stitch/shared/chat/messages';

import { RowContent } from '@/components/chat/message-list/row-content';
import {
  ALWAYS_UNVIRTUALIZED_TAIL_ROWS,
  BASE_MESSAGE_HEIGHT_ESTIMATE,
  buildRows,
  estimateRowHeight,
} from '@/components/chat/message-list/rows';
import type { SessionStreamState } from '@/stores/stream-store';

type MessageListProps = {
  messages: Message[];
  streamState: SessionStreamState;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onAbortTool?: () => void;
  onSplit?: (msgId: string) => void;
};

export function MessageList({
  messages,
  streamState,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onAbortTool,
  onSplit,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => buildRows(messages, streamState, hasMore, isFetchingMore),
    [messages, streamState, hasMore, isFetchingMore],
  );

  const hasStreamContent =
    streamState.isStreaming || streamState.partIds.length > 0 || streamState.error !== null;

  // Auto-load more when the sentinel becomes visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isFetchingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore]);

  const firstUnvirtualizedRowIndex = useMemo(() => {
    const firstTailRowIndex = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
    if (!streamState.isStreaming) return firstTailRowIndex;

    return firstTailRowIndex;
  }, [rows.length, streamState.isStreaming]);

  const virtualizedRowCount = Math.min(firstUnvirtualizedRowIndex, rows.length);

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => parentRef.current,
    getItemKey: useCallback(
      (index: number) => {
        const row = rows[index];
        if (!row) return index;
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
        return row ? estimateRowHeight(row) : BASE_MESSAGE_HEIGHT_ESTIMATE;
      },
      [rows],
    ),
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);

  return (
    <div ref={parentRef} className="flex flex-col gap-6 py-4">
      {virtualizedRowCount > 0 && (
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

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
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <RowContent
                  row={row}
                  streamState={streamState}
                  isFetchingMore={isFetchingMore}
                  onLoadMore={onLoadMore}
                  onAbortTool={onAbortTool}
                  onSplit={onSplit}
                  sentinelRef={sentinelRef}
                />
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row, index) => {
        const rowKey =
          row.kind === 'streaming' || row.kind === 'error' || row.kind === 'load-more'
            ? `tail-${row.kind}-${index}`
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
              sentinelRef={sentinelRef}
            />
          </div>
        );
      })}

      {!hasStreamContent && messages.length === 0 && (
        <div className="flex justify-start">
          <div className="text-sm text-muted-foreground">Start a conversation...</div>
        </div>
      )}
    </div>
  );
}
