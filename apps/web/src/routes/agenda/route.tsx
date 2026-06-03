import { createFileRoute, Outlet } from '@tanstack/react-router';

import { agendaListsQueryOptions } from '@/lib/queries/agenda';

export const Route = createFileRoute('/agenda')({
  loader: ({ context }) => context.queryClient.ensureQueryData(agendaListsQueryOptions()),
  component: Outlet,
});
