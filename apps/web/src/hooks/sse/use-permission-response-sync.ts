import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { permissionResponseKeys } from '@/lib/queries/permissions';

export function usePermissionResponseSync(sessionId: string): void {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: permissionResponseKeys.list(sessionId) });
  };

  useSSE({
    'permission-response-requested': () => {
      invalidate();
    },
    'permission-response-resolved': () => {
      invalidate();
    },
  });
}
