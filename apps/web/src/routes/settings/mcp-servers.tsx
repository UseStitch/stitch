import { createFileRoute } from '@tanstack/react-router';

import { McpServersSettings } from '@/components/settings/mcp-servers';
import { mcpRegistryQueryOptions, mcpServersQueryOptions } from '@/lib/queries/mcp';

export const Route = createFileRoute('/settings/mcp-servers')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(mcpServersQueryOptions),
      context.queryClient.ensureQueryData(mcpRegistryQueryOptions),
    ]),
  component: McpServersSettings,
});
