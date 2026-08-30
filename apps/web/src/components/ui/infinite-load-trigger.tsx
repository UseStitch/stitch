import type { RefObject } from 'react';

import { Spinner } from '@/components/ui/spinner';

type InfiniteLoadTriggerProps = {
  sentinelRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
};

export function InfiniteLoadTrigger({ sentinelRef, isLoading }: InfiniteLoadTriggerProps) {
  return (
    <div ref={sentinelRef} className="flex h-9 items-center justify-center">
      {isLoading ? <Spinner tone="muted" /> : null}
    </div>
  );
}
