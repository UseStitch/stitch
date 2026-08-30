import { createFileRoute, Outlet } from '@tanstack/react-router';

import { automationsPageQueryOptions, automationsSidebarListQueryOptions } from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/automations')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureInfiniteQueryData(automationsSidebarListQueryOptions),
      context.queryClient.ensureQueryData(
        automationsPageQueryOptions({ page: 1, pageSize: 15, sort: 'updatedAt', sortDirection: 'desc' }),
      ),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
    ]),
  component: Outlet,
});
