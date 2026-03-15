import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/lib/queries/chat';
import type { ChatStreamState } from '@/hooks/use-chat-stream';

type UseSessionStreamOptions = {
  sessionId: string;
  streamState: Pick<ChatStreamState, 'isStreaming' | 'finishReason'>;
  activeMessageId: string | null;
  setActiveMessageId: (id: string | null) => void;
};

export function useSessionStream({
  sessionId,
  streamState,
  activeMessageId,
  setActiveMessageId,
}: UseSessionStreamOptions): void {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!streamState.isStreaming && activeMessageId !== null && streamState.finishReason !== null) {
      void queryClient
        .resetQueries({ queryKey: sessionKeys.messages(sessionId) })
        .then(() => setActiveMessageId(null));
    }
  }, [
    streamState.isStreaming,
    streamState.finishReason,
    activeMessageId,
    sessionId,
    queryClient,
    setActiveMessageId,
  ]);
}
