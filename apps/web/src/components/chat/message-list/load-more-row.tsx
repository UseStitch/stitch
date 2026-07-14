import * as React from 'react';

import { Spinner } from '@/components/ui/spinner';

type LoadMoreRowProps = {
  isFetchingMore: boolean;
  onLoadMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
};

export function LoadMoreRow({ isFetchingMore, onLoadMore, sentinelRef }: LoadMoreRowProps) {
  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-3">
      {isFetchingMore ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" className="text-muted-foreground" />
          Loading older messages...
        </div>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Load older messages
        </button>
      )}
    </div>
  );
}
