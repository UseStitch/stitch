import { createFileRoute } from '@tanstack/react-router';

import { AgendaPage } from '@/components/agenda/agenda-page';
import { agendaItemsQueryOptions, agendaListsQueryOptions } from '@/lib/queries/agenda';

export const Route = createFileRoute('/agenda/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agendaListsQueryOptions()),
      context.queryClient.ensureQueryData(agendaItemsQueryOptions({ page: 1, pageSize: 20 })),
    ]),
  component: () => <AgendaPage />,
});
