import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type { Session, SessionsPage } from '@stitch/shared/chat/messages';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

export function useSessionTitleUpdates(
  onTitleUpdate?: (sessionId: string, title: string) => void,
): void {
  const queryClient = useQueryClient();

  useSSE({
    'session-title-update': (data) => {
      const { sessionId, title } = data;

      // Update all session list caches (including infinite queries used by sidebar)
      queryClient.setQueriesData<InfiniteData<SessionsPage>>(
        { queryKey: sessionKeys.list() },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              sessions: page.sessions.map((s) => (s.id === sessionId ? { ...s, title } : s)),
            })),
          };
        },
      );

      // Update the session detail cache if present
      queryClient.setQueryData<Session>(sessionKeys.detail(sessionId), (prev) =>
        prev ? { ...prev, title } : prev,
      );

      onTitleUpdate?.(sessionId, title);
    },
  });
}
