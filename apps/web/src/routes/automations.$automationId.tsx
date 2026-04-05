import { createFileRoute } from '@tanstack/react-router';

import { AutomationsPage } from '@/components/automations/automations-page';
import { automationSessionsQueryOptions, automationsQueryOptions } from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/automations/$automationId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(automationsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(automationSessionsQueryOptions(params.automationId)),
    ]),
  component: RouteComponent,
});

function RouteComponent() {
  const { automationId } = Route.useParams();
  return <AutomationsPage automationId={automationId} />;
}
