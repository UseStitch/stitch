import { createFileRoute } from '@tanstack/react-router';

import { MemorySettings } from '@/components/settings/memory';
import { embeddingProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/memory')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(embeddingProviderModelsQueryOptions),
    ]),
  component: MemorySettings,
});
