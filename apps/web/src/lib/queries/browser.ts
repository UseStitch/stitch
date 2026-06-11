import { toast } from 'sonner';

import { queryOptions, type MutationOptions, type QueryClient } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';

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
  queryFn: () => serverRequest<ChromeProfile[]>('/browser/profiles'),
});

export function importProfileMutationOptions(
  queryClient: QueryClient,
): MutationOptions<ImportResult, Error, string> {
  return {
    mutationFn: (profileId: string) =>
      serverRequest<ImportResult>('/browser/import-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Chrome profile imported: ${data.profile ?? 'done'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  };
}
