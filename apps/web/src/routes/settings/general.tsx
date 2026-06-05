import { createFileRoute } from '@tanstack/react-router';

import { GeneralSettings } from '@/components/settings/general';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/general')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
    ]),
  component: GeneralSettings,
});
