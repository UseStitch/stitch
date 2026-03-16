import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { permissionResponseKeys } from '@/lib/queries/permissions';

export function usePermissionResponseSync(sessionId: string): void {
  const queryClient = useQueryClient();

  const invalidate = (incomingSessionId: string) => {
    if (incomingSessionId !== sessionId) return;
    void queryClient.invalidateQueries({ queryKey: permissionResponseKeys.list(sessionId) });
  };

  useSSE({
    'permission-response-requested': (data) => {
      const payload = data as { permissionResponse: { sessionId: string } };
      invalidate(payload.permissionResponse?.sessionId);
    },
    'permission-response-resolved': (data) => {
      const payload = data as { sessionId: string };
      invalidate(payload.sessionId);
    },
  });
}
