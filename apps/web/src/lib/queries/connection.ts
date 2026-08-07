import { toast } from 'sonner';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ServerConnectionConfig, ServerMode } from '@/lib/api';

const connectionKeys = { all: ['connection'] as const, config: () => [...connectionKeys.all, 'config'] as const };

export const serverConfigQueryOptions = queryOptions({
  queryKey: connectionKeys.config(),
  queryFn: (): Promise<ServerConnectionConfig> => window.api.getServerConfig(),
});

export function useTestRemoteConnection() {
  return useMutation({
    mutationFn: (url: string): Promise<{ ok: boolean; url?: string; error?: string }> =>
      window.api.server.testRemote(url),
  });
}

export function useSaveServerConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { mode: ServerMode; remoteUrl: string | null }): Promise<ServerConnectionConfig> =>
      window.api.server.setConfig(input),
    onSuccess: (config) => {
      queryClient.setQueryData(connectionKeys.config(), config);
      toast.success('Server connection updated', { id: 'connection-update' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update server connection', { id: 'connection-update' });
    },
  });
}
