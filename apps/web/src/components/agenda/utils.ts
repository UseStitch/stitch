import { useQuery } from '@tanstack/react-query';

import { settingsQueryOptions } from '@/lib/queries/settings';

export function useUserTimezone(): string {
  const { data: settings } = useQuery(settingsQueryOptions);
  return settings?.['profile.timezone'] || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatDateInTz(ts: number, timeZone: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}
