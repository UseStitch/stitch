import { createFileRoute } from '@tanstack/react-router';

import { BrowserSettings } from '@/components/settings/browser';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';

export const Route = createFileRoute('/settings/browser')({
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(appEnabledStatesQueryOptions);
  },
  component: BrowserSettings,
});
