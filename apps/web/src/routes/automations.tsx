import { createFileRoute } from '@tanstack/react-router';

import { AutomationsPage } from '@/components/automations/automations-page';
import { automationsQueryOptions } from '@/lib/queries/automations';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/automations')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(automationsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
    ]),
  component: AutomationsPage,
});
