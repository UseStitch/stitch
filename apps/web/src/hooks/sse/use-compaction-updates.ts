import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSessionEvents } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

export function useCompactionUpdates(sessionId: string): { isCompacting: boolean } {
  const queryClient = useQueryClient();
  const [isCompacting, setIsCompacting] = React.useState(false);

  useSessionEvents(sessionId, {
    'compaction-start': () => {
      setIsCompacting(true);
    },
    'compaction-complete': () => {
      setIsCompacting(false);
      void queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) });
    },
  });

  return { isCompacting };
}
