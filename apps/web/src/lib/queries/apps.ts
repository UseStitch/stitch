import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppEnabledState, AppId } from '@stitch/shared/apps/types';

import { serverRequest } from '@/lib/api';
import { toolKeys } from '@/lib/queries/tools';

const appKeys = { all: ['apps-config'] as const, enabledStates: () => [...appKeys.all, 'enabled-states'] as const };

export const appEnabledStatesQueryOptions = queryOptions({
  queryKey: appKeys.enabledStates(),
  queryFn: async (): Promise<AppEnabledState[]> => {
    const data = await serverRequest<{ states: AppEnabledState[] }>('/config/apps/enabled');
    return data.states;
  },
});

export function useSetAppEnabledState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appId: AppId; enabled: boolean }) =>
      serverRequest<void>('/config/tools/enabled', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'app', identifier: input.appId, enabled: input.enabled }),
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: appKeys.enabledStates() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.enabledStates() }),
        queryClient.invalidateQueries({ queryKey: toolKeys.knownToolsets() }),
      ]);
    },
  });
}
