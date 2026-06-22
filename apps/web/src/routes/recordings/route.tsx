import { toast } from 'sonner';

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';

export const Route = createFileRoute('/recordings')({
  loader: async ({ context }) => {
    const appStates = await context.queryClient.ensureQueryData(appEnabledStatesQueryOptions);
    const recordingsEnabled =
      appStates.find((state) => state.appId === 'recordings')?.enabled ?? true;
    if (!recordingsEnabled) {
      toast.warning('Recordings is disabled. Enable it in Settings > Recordings.');
      throw redirect({ to: '/' });
    }
  },
  component: Outlet,
});
