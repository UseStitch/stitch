import { createFileRoute } from '@tanstack/react-router';

import { AgendaSettings } from '@/components/settings/agenda';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';

export const Route = createFileRoute('/settings/agenda')({
  loader: ({ context }) => context.queryClient.ensureQueryData(appEnabledStatesQueryOptions),
  component: AgendaSettings,
});
