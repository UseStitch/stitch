import { createFileRoute } from '@tanstack/react-router';

import { ProvidersSettings } from '@/components/settings/providers';
import { providersQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/settings/providers')({
  loader: ({ context }) => context.queryClient.ensureQueryData(providersQueryOptions),
  component: ProvidersSettings,
});
