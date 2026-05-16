import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { todoKeys } from '@/lib/queries/todos';

export function useTodoSync(sessionId: string): void {
  const queryClient = useQueryClient();

  useSSE({
    'session-todos-updated': (payload) => {
      if (payload.sessionId !== sessionId) return;
      void queryClient.invalidateQueries({ queryKey: todoKeys.list(sessionId) });
    },
  });
}
