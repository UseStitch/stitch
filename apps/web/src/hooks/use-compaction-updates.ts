import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CompactionStartPayload, CompactionCompletePayload } from '@openwork/shared';
import { useSSE } from '@/hooks/use-sse';
import { sessionKeys } from '@/lib/queries/chat';

export function useCompactionUpdates(sessionId: string): { isCompacting: boolean } {
  const queryClient = useQueryClient();
  const [isCompacting, setIsCompacting] = React.useState(false);

  useSSE({
    'compaction-start': (data) => {
      const payload = data as CompactionStartPayload;
      if (payload.sessionId !== sessionId) return;
      setIsCompacting(true);
    },
    'compaction-complete': (data) => {
      const payload = data as CompactionCompletePayload;
      if (payload.sessionId !== sessionId) return;
      setIsCompacting(false);
      void queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) });
    },
  });

  return { isCompacting };
}
