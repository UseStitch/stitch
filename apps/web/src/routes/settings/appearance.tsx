import { createFileRoute } from '@tanstack/react-router';

import { AppearanceSettings } from '@/components/settings/appearance';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/appearance')({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQueryOptions),
  component: AppearanceSettings,
});
