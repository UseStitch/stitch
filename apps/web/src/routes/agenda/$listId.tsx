import { createFileRoute } from '@tanstack/react-router';

import { AgendaPage } from '@/components/agenda/agenda-page';
import { agendaItemsQueryOptions } from '@/lib/queries/agenda';

export const Route = createFileRoute('/agenda/$listId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      agendaItemsQueryOptions({ page: 1, pageSize: 20, listId: params.listId }),
    ),
  component: RouteComponent,
});

function RouteComponent() {
  const { listId } = Route.useParams();
  return <AgendaPage listId={listId} />;
}
