import { createFileRoute } from '@tanstack/react-router';

import { AgentsSettings } from '@/components/settings/agents';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/agents')({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQueryOptions),
  component: AgentsSettings,
});
