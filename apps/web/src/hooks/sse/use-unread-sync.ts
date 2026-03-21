import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import type { Session } from '@stitch/shared/chat/messages';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';

function useUnreadSync(): void {
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });

  function handleSessionActivity(sessionId: string): void {
    if (sessionId === params.id) return;

    queryClient.setQueryData<Session[]>(sessionKeys.list(), (prev) => {
      if (!prev) return prev;
      return prev.map((s) => (s.id === sessionId ? { ...s, isUnread: true } : s));
    });
  }

  useSSE({
    'question-asked': (data) => {
      const { question } = data;
      handleSessionActivity(question.sessionId);
    },
    'permission-response-requested': (data) => {
      const { permissionResponse } = data;
      handleSessionActivity(permissionResponse.sessionId);
    },
  });
}

/** Render-less component that marks sessions unread when questions or permissions fire mid-stream. */
export function UnreadSync() {
  useUnreadSync();
  return null;
}
