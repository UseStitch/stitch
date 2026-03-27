import { toast } from 'sonner';

import { queryOptions, type MutationOptions, type QueryClient } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';

type ChromeProfile = {
  id: string;
  name: string;
  email: string;
};

type ImportResult = {
  success?: boolean;
  profile?: string;
  error?: string;
};

const browserKeys = {
  all: ['browser'] as const,
  profiles: () => [...browserKeys.all, 'profiles'] as const,
};

export const chromeProfilesQueryOptions = queryOptions({
  queryKey: browserKeys.profiles(),
  queryFn: async (): Promise<ChromeProfile[]> => {
    const res = await serverFetch('/browser/profiles');
    if (!res.ok) throw new Error('Failed to fetch Chrome profiles');
    return res.json() as Promise<ChromeProfile[]>;
  },
});

export function importProfileMutationOptions(
  queryClient: QueryClient,
): MutationOptions<ImportResult, Error, string> {
  return {
    mutationFn: async (profileId: string) => {
      const res = await serverFetch('/browser/import-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const data = (await res.json()) as ImportResult;
      if (!res.ok) {
        throw new Error(data.error ?? 'Import failed');
      }
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Chrome profile imported: ${data.profile ?? 'done'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  };
}
