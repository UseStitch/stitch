import { createFileRoute, Outlet } from '@tanstack/react-router';

import { automationsPageQueryOptions, automationsQueryOptions } from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/automations')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(automationsQueryOptions),
      context.queryClient.ensureQueryData(automationsPageQueryOptions({ page: 1, pageSize: 10 })),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
    ]),
  component: Outlet,
});
