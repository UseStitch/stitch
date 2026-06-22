import { toast } from 'sonner';

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { agendaListsQueryOptions } from '@/lib/queries/agenda';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';

export const Route = createFileRoute('/agenda')({
  loader: async ({ context }) => {
    const appStates = await context.queryClient.ensureQueryData(appEnabledStatesQueryOptions);
    const agendaEnabled = appStates.find((state) => state.appId === 'agenda')?.enabled ?? true;
    if (!agendaEnabled) {
      toast.warning('Agenda is disabled. Enable it in Settings > Agenda.');
      throw redirect({ to: '/' });
    }

    return context.queryClient.ensureQueryData(agendaListsQueryOptions());
  },
  component: Outlet,
});
