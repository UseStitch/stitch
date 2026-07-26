import * as React from 'react';

import { Button } from '@/components/ui/button';
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
        <Button
          type="button"
          variant="ghost"
          onClick={onLoadMore}
          className="h-auto p-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground">
          Load older messages
        </Button>
      )}
    </div>
  );
}
