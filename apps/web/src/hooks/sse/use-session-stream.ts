import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { sessionKeys } from '@/lib/queries/chat';
import { useStreamStore } from '@/stores/stream-store';

type UseSessionStreamOptions = {
  sessionId: string;
};

/**
 * Watches a single session's stream lifecycle and invalidates the
 * TanStack Query message cache once the stream finishes.
 * Scoped per-session — multiple instances can run concurrently.
 */
export function useSessionStream({ sessionId }: UseSessionStreamOptions): void {
  const queryClient = useQueryClient();
  const streamState = useSessionStreamState(sessionId);
  const resetSession = useStreamStore((s) => s.resetSession);

  React.useEffect(() => {
    if (
      !streamState.isStreaming &&
      streamState.activeMessageId !== null &&
      streamState.finishReason !== null &&
      streamState.error === null
    ) {
      void Promise.all([
        queryClient.resetQueries({ queryKey: sessionKeys.messages(sessionId) }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.stats(sessionId) }),
      ]).then(() => resetSession(sessionId));
    }
  }, [
    streamState.isStreaming,
    streamState.finishReason,
    streamState.activeMessageId,
    streamState.error,
    sessionId,
    queryClient,
    resetSession,
  ]);
}
