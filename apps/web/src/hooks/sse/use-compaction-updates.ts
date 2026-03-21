import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

export function useCompactionUpdates(sessionId: string): { isCompacting: boolean } {
  const queryClient = useQueryClient();
  const [isCompacting, setIsCompacting] = React.useState(false);

  useSSE({
    'compaction-start': (data) => {
      const payload = data;
      if (payload.sessionId !== sessionId) return;
      setIsCompacting(true);
    },
    'compaction-complete': (data) => {
      const payload = data;
      if (payload.sessionId !== sessionId) return;
      setIsCompacting(false);
      void queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) });
    },
  });

  return { isCompacting };
}
