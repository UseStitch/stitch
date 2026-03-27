import * as React from 'react';

import { ErrorPanel } from '@/components/chat/error-panel';
import {
  CompactionDivider,
  MessageBubble,
  StreamingMessageBubble,
} from '@/components/chat/message-bubble';
import { LoadMoreRow } from '@/components/chat/message-list/load-more-row';
import type { SessionStreamState } from '@/stores/stream-store';

import type { RowData } from './rows';

type RowContentProps = {
  row: RowData;
  streamState: SessionStreamState;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onAbortTool?: () => void;
  onSplit?: (msgId: string) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
};

export function RowContent({
  row,
  streamState,
  isFetchingMore,
  onLoadMore,
  onAbortTool,
  onSplit,
  sentinelRef,
}: RowContentProps) {
  switch (row.kind) {
    case 'load-more':
      return (
        <LoadMoreRow isFetchingMore={isFetchingMore} onLoadMore={onLoadMore} sentinelRef={sentinelRef} />
      );

    case 'compaction':
      return <CompactionDivider summaryParts={row.summaryParts} />;

    case 'message':
      return (
        <MessageBubble
          role={row.role}
          parts={row.parts}
          finishReason={row.finishReason}
          onAbortTool={onAbortTool}
          onSplit={
            row.role === 'user' && !row.isFirstUserMessage && onSplit ? () => onSplit(row.id) : undefined
          }
        />
      );

    case 'streaming':
      return (
        <StreamingMessageBubble
          partIds={streamState.partIds}
          parts={streamState.parts}
          onAbortTool={onAbortTool}
        />
      );

    case 'error':
      return (
        <div className="flex justify-start">
          <ErrorPanel title={row.title} message={row.message} suggestion={row.suggestion} />
        </div>
      );
  }
}
