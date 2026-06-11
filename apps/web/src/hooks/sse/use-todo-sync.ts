import { useQueryClient } from '@tanstack/react-query';

import { useSessionEvents } from '@/hooks/sse/sse-context';
import { todoKeys } from '@/lib/queries/todos';

export function useTodoSync(sessionId: string): void {
  const queryClient = useQueryClient();

  useSessionEvents(sessionId, {
    'session-todos-updated': () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.list(sessionId) });
    },
  });
}
