import { createFileRoute } from '@tanstack/react-router';

import { NewSessionPage } from '@/components/home/new-session-page';
import { agentsQueryOptions } from '@/lib/queries/agents';
import {
  enabledProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: NewSessionPage,
});
