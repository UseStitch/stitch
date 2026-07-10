import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSessionEvents } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

export function useCompactionUpdates(sessionId: string): { isCompacting: boolean } {
  const queryClient = useQueryClient();
  const [isCompacting, setIsCompacting] = React.useState(false);

  useSessionEvents(sessionId, {
    'session.compaction.started': () => {
      setIsCompacting(true);
    },
    'session.compaction.completed': () => {
      setIsCompacting(false);
      void queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) });
    },
  });

  return { isCompacting };
}
