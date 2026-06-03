import { createFileRoute } from '@tanstack/react-router';

import { AutomationsPage } from '@/components/automations/automations-page';
import { automationSessionsQueryOptions } from '@/lib/queries/automations';

export const Route = createFileRoute('/automations/$automationId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(automationSessionsQueryOptions(params.automationId)),
  component: RouteComponent,
});

function RouteComponent() {
  const { automationId } = Route.useParams();
  return <AutomationsPage automationId={automationId} />;
}
