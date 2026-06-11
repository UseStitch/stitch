import { toast } from 'sonner';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ServerConnectionConfig, ServerMode } from '@/lib/api';

const connectionKeys = {
  all: ['connection'] as const,
  config: () => [...connectionKeys.all, 'config'] as const,
};

export const serverConfigQueryOptions = queryOptions({
  queryKey: connectionKeys.config(),
  queryFn: async (): Promise<ServerConnectionConfig> => {
    if (!window.api?.getServerConfig) {
      throw new Error('Server config is only available from the desktop app');
    }
    return window.api.getServerConfig();
  },
});

export function useTestRemoteConnection() {
  return useMutation({
    mutationFn: async (url: string): Promise<{ ok: boolean; url?: string; error?: string }> => {
      if (!window.api?.server?.testRemote) {
        throw new Error('Remote testing is only available from the desktop app');
      }
      return window.api.server.testRemote(url);
    },
  });
}

export function useSaveServerConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      mode: ServerMode;
      remoteUrl: string | null;
    }): Promise<ServerConnectionConfig> => {
      if (!window.api?.server?.setConfig) {
        throw new Error('Server config is only available from the desktop app');
      }
      return window.api.server.setConfig(input);
    },
    onSuccess: (config) => {
      queryClient.setQueryData(connectionKeys.config(), config);
      toast.success('Server connection updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update server connection');
    },
  });
}
