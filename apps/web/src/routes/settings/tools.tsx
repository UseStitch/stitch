import { createFileRoute } from '@tanstack/react-router';

import { ToolsSettings } from '@/components/settings/permissions';
import {
  knownMcpToolsQueryOptions,
  knownToolsetsQueryOptions,
  knownToolsQueryOptions,
  toolEnabledStatesQueryOptions,
} from '@/lib/queries/tools';

export const Route = createFileRoute('/settings/tools')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(knownToolsQueryOptions),
      context.queryClient.ensureQueryData(knownMcpToolsQueryOptions),
      context.queryClient.ensureQueryData(knownToolsetsQueryOptions),
      context.queryClient.ensureQueryData(toolEnabledStatesQueryOptions),
    ]),
  component: ToolsSettings,
});
