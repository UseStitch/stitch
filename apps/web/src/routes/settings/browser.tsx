import { createFileRoute } from '@tanstack/react-router';

import { BrowserSettings } from '@/components/settings/browser';
import { toolEnabledStatesQueryOptions } from '@/lib/queries/tools';

export const Route = createFileRoute('/settings/browser')({
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(toolEnabledStatesQueryOptions);
  },
  component: BrowserSettings,
});
