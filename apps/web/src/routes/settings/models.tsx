import { createFileRoute } from '@tanstack/react-router';

import { ModelsSettings } from '@/components/settings/models';
import { modelVisibilityQueryOptions } from '@/lib/queries/model-visibility';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/settings/models')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(modelVisibilityQueryOptions),
    ]),
  component: ModelsSettings,
});
