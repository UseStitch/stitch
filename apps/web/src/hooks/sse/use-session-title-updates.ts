import { useQueryClient } from '@tanstack/react-query';

import type { Session } from '@stitch/shared/chat/messages';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

export function useSessionTitleUpdates(
  onTitleUpdate?: (sessionId: string, title: string) => void,
): void {
  const queryClient = useQueryClient();

  useSSE({
    'session-title-update': (data) => {
      const { sessionId, title } = data;

      // Update the session list cache
      queryClient.setQueryData<Session[]>(sessionKeys.list(), (prev) =>
        prev?.map((s) => (s.id === sessionId ? { ...s, title } : s)),
      );

      // Update the session detail cache if present
      queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (prev) =>
        prev ? { ...prev, title } : prev,
      );

      onTitleUpdate?.(sessionId, title);
    },
  });
}
