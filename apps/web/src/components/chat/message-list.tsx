import { useMemo, useRef, useCallback, useEffect } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { Message } from '@openwork/shared';

import {
  MessageBubble,
  StreamingMessageBubble,
  CompactionDivider,
} from '@/components/chat/message-bubble';
import type { SessionStreamState } from '@/stores/stream-store';

const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;
const BASE_MESSAGE_HEIGHT_ESTIMATE = 200;
const MESSAGE_HEIGHT_PER_CHAR = 20;

type MessageListProps = {
  messages: Message[];
  streamState: SessionStreamState;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onAbortTool?: () => void;
};

type RowData =
  | { kind: 'load-more' }
  | {
      kind: 'message';
      id: string;
      role: 'user' | 'assistant';
      parts: Message['parts'];
      finishReason: Message['finishReason'];
    }
  | { kind: 'compaction'; id: string; summaryParts?: Message['parts'] }
  | { kind: 'streaming' }
  | { kind: 'error'; message: string };

function buildRows(
  messages: Message[],
  streamState: SessionStreamState,
  hasMore: boolean,
  isFetchingMore: boolean,
): RowData[] {
  const rows: RowData[] = [];

  if (hasMore || isFetchingMore) {
    rows.push({ kind: 'load-more' });
  }

  const summaryByMarker = new Map<string, Message>();
  const pairedSummaryIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.parts.some((p) => p.type === 'compaction')) {
      const next = messages[i + 1];
      if (next?.isSummary) {
        summaryByMarker.set(msg.id, next);
        pairedSummaryIds.add(next.id);
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'user' && msg.parts.some((p) => p.type === 'compaction')) {
      const summary = summaryByMarker.get(msg.id);
      rows.push({ kind: 'compaction', id: msg.id, summaryParts: summary?.parts });
      continue;
    }

    if (pairedSummaryIds.has(msg.id)) {
      continue;
    }

    if (msg.role !== 'user' && msg.role !== 'assistant') {
      continue;
    }

    rows.push({
      kind: 'message',
      id: msg.id,
      role: msg.role,
      parts: msg.parts,
      finishReason: msg.finishReason,
    });
  }

  const hasStreamContent =
    streamState.isStreaming || streamState.partIds.length > 0 || streamState.error !== null;

  if (hasStreamContent) {
    if (streamState.error) {
      rows.push({ kind: 'error', message: streamState.error });
    } else {
      rows.push({ kind: 'streaming' });
    }
  }

  return rows;
}

function estimateRowHeight(row: RowData): number {
  if (row.kind === 'load-more') {
    return 48;
  }

  if (row.kind === 'compaction') {
    return 60;
  }

  if (row.kind === 'streaming') {
    return 60;
  }

  if (row.kind === 'error') {
    return 80;
  }

  if (row.kind === 'message') {
    const textContent = row.parts
      .filter((p) => p.type === 'text-delta')
      .map((p) => (p as { type: 'text-delta'; text: string }).text)
      .join('');

    const charCount = textContent.length;
    const hasCodeBlocks = textContent.includes('```');
    const hasReasoning = row.parts.some((p) => p.type === 'reasoning-delta');
    const hasToolCalls = row.parts.some((p) => p.type === 'tool-call');

    let estimate = BASE_MESSAGE_HEIGHT_ESTIMATE + charCount * MESSAGE_HEIGHT_PER_CHAR;

    if (hasCodeBlocks) {
      estimate += 200;
    }
    if (hasReasoning) {
      estimate += 100;
    }
    if (hasToolCalls) {
      estimate += 50;
    }

    return Math.min(Math.max(estimate, 80), 1500);
  }

  return BASE_MESSAGE_HEIGHT_ESTIMATE;
}

export function MessageList({
  messages,
  streamState,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onAbortTool,
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

  const renderRowContent = (row: RowData) => {
    switch (row.kind) {
      case 'load-more':
        return (
          <div key="load-more" ref={sentinelRef} className="flex items-center justify-center py-3">
            {isFetchingMore ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                Loading older messages...
              </div>
            ) : (
              <button
                type="button"
                onClick={onLoadMore}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Load older messages
              </button>
            )}
          </div>
        );

      case 'compaction':
        return <CompactionDivider key={row.id} summaryParts={row.summaryParts} />;

      case 'message':
        return (
          <MessageBubble
            key={row.id}
            role={row.role}
            parts={row.parts}
            finishReason={row.finishReason}
            onAbortTool={onAbortTool}
          />
        );

      case 'streaming':
        return (
          <StreamingMessageBubble
            key="streaming"
            partIds={streamState.partIds}
            parts={streamState.parts}
            isStreaming={streamState.isStreaming}
            onAbortTool={onAbortTool}
          />
        );

      case 'error':
        return (
          <div key="error" className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {row.message}
            </div>
          </div>
        );
    }
  };

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
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRowContent(row)}
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row) => renderRowContent(row))}

      {!hasStreamContent && messages.length === 0 && (
        <div className="flex justify-start">
          <div className="text-sm text-muted-foreground">Start a conversation...</div>
        </div>
      )}
    </div>
  );
}
