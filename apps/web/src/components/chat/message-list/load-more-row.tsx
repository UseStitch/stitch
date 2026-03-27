import * as React from 'react';

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
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          Loading older messages...
        </div>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Load older messages
        </button>
      )}
    </div>
  );
}
