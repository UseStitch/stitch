import { createFileRoute } from '@tanstack/react-router';

import { ConnectionSettings } from '@/components/settings/connection';
import { serverConfigQueryOptions } from '@/lib/queries/connection';

export const Route = createFileRoute('/settings/connection')({
  loader: ({ context }) => context.queryClient.ensureQueryData(serverConfigQueryOptions),
  component: ConnectionSettings,
});
