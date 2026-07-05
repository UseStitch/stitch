import { toast } from 'sonner';

import { queryOptions, type QueryClient, type MutationOptions } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';

type UserSettings = Record<string, string>;

const settingsKeys = { all: ['settings'] as const, list: () => [...settingsKeys.all, 'list'] as const };

export const settingsQueryOptions = queryOptions({
  queryKey: settingsKeys.list(),
  queryFn: () => serverRequest<UserSettings>('/settings'),
});

export function saveSettingMutationOptions(
  key: string,
  queryClient: QueryClient,
  options?: { silent?: boolean; successMessage?: string },
): MutationOptions<void, Error, string> {
  return {
    mutationFn: (value: string) =>
      serverRequest<void>(`/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      if (!options?.silent) toast.success(options?.successMessage ?? 'Setting Saved', { id: `setting-save-${key}` });
    },
    onError: (err: Error) => toast.error(err.message, { id: `setting-save-${key}` }),
  };
}

export function deleteSettingMutationOptions(
  key: string,
  queryClient: QueryClient,
  options?: { silent?: boolean; successMessage?: string },
): MutationOptions<void, Error, void> {
  return {
    mutationFn: () =>
      serverRequest<void>(`/settings/${key}`, { method: 'DELETE' }).catch((err) => {
        if (err instanceof Error && err.message.includes('status 404')) return;
        throw err;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      if (!options?.silent) toast.success(options?.successMessage ?? 'Setting Reset', { id: `setting-delete-${key}` });
    },
    onError: (err: Error) => toast.error(err.message, { id: `setting-delete-${key}` }),
  };
}
