import { toast } from 'sonner';

import { queryOptions, type QueryClient, type MutationOptions } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';

type UserSettings = Record<string, string>;

const settingsKeys = {
  all: ['settings'] as const,
  list: () => [...settingsKeys.all, 'list'] as const,
};

export const settingsQueryOptions = queryOptions({
  queryKey: settingsKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<UserSettings> => {
    const res = await serverFetch('/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json() as Promise<UserSettings>;
  },
});

export function saveSettingMutationOptions(
  key: string,
  queryClient: QueryClient,
  options?: { silent?: boolean },
): MutationOptions<void, Error, string> {
  return {
    mutationFn: async (value: string) => {
      const res = await serverFetch(`/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to save');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      if (!options?.silent) toast.success('Model preference saved');
    },
    onError: (err: Error) => toast.error(err.message),
  };
}

export function deleteSettingMutationOptions(
  key: string,
  queryClient: QueryClient,
): MutationOptions<void, Error, void> {
  return {
    mutationFn: async () => {
      const res = await serverFetch(`/settings/${key}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error('Failed to reset');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success('Model preference reset');
    },
    onError: (err: Error) => toast.error(err.message),
  };
}
