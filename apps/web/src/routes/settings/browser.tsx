import { createFileRoute } from '@tanstack/react-router';

import { BrowserSettings } from '@/components/settings/browser';
import { chromeProfilesQueryOptions } from '@/lib/queries/browser';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { toolEnabledStatesQueryOptions } from '@/lib/queries/tools';

export const Route = createFileRoute('/settings/browser')({
  loader: ({ context }) => {
    const baseQueries = [
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(toolEnabledStatesQueryOptions),
    ] as const;

    if (window.electron?.platform === 'darwin') {
      return Promise.all([
        ...baseQueries,
        context.queryClient.ensureQueryData(chromeProfilesQueryOptions),
      ]);
    }

    return Promise.all(baseQueries);
  },
  component: BrowserSettings,
});
