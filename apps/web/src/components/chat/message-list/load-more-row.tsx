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
    <div ref={sentinelRef} className="flex items-center justify-center py-space-l">
      {isFetchingMore ? (
        <div className="flex items-center gap-space-m text-xs text-muted-foreground">
          <Spinner size="sm" className="text-muted-foreground" />
          Loading older messages...
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={onLoadMore}
          className="h-auto p-space-none text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground">
          Load older messages
        </Button>
      )}
    </div>
  );
}
