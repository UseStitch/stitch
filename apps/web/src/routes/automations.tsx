import { createFileRoute, Outlet } from '@tanstack/react-router';

import { automationsQueryOptions } from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/automations')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(automationsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
    ]),
  component: Outlet,
});
