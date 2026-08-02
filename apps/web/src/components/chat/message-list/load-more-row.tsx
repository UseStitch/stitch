import * as React from 'react';

import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
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
        <Stack direction="row" align="center" gap="m">
          <Spinner size="sm" tone="muted" />
          <Text as="span" variant="caption" tone="muted">
            Loading older messages...
          </Text>
        </Stack>
      ) : (
        <Button type="button" variant="quiet" size="inline" onClick={onLoadMore}>
          Load older messages
        </Button>
      )}
    </div>
  );
}
