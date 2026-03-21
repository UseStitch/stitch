import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import type {
  QuestionAskedPayload,
  PermissionResponseRequestedPayload,
} from '@stitch/shared/chat/realtime';

import { useSSE } from '@/hooks/sse/sse-context';
import { sessionKeys } from '@/lib/queries/chat';
import type { Session } from '@stitch/shared/chat/messages';

function useUnreadSync(): void {
  const queryClient = useQueryClient();
  const params = useParams({ strict: false }) as { id?: string };

  function handleSessionActivity(sessionId: string): void {
    if (sessionId === params.id) return;

    // Optimistically update the sessions list cache so the unread dot appears
    // immediately without waiting for a network round-trip.
    queryClient.setQueryData<Session[]>(sessionKeys.list(), (prev) => {
      if (!prev) return prev;
      return prev.map((s) => (s.id === sessionId ? { ...s, isUnread: true } : s));
    });
  }

  useSSE({
    'question-asked': (data) => {
      const { question } = data as QuestionAskedPayload;
      handleSessionActivity(question.sessionId);
    },
    'permission-response-requested': (data) => {
      const { permissionResponse } = data as PermissionResponseRequestedPayload;
      handleSessionActivity(permissionResponse.sessionId);
    },
  });
}

/** Render-less component that marks sessions unread when questions or permissions fire mid-stream. */
export function UnreadSync() {
  useUnreadSync();
  return null;
}
