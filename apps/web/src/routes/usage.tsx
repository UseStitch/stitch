import { createFileRoute } from '@tanstack/react-router';

import { UsageDashboardPage } from '@/components/usage/usage-dashboard-page';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import { usageDashboardQueryOptions } from '@/lib/queries/usage';

export const Route = createFileRoute('/usage')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(usageDashboardQueryOptions({ range: '30d' })),
    ]),
  component: UsageDashboardPage,
});
