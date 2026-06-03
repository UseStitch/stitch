import { createFileRoute } from '@tanstack/react-router';

import { MemoriesPage } from '@/components/memories/memories-page';
import { memoryStatsQueryOptions, semanticMemoriesQueryOptions } from '@/lib/queries/memories';

export const Route = createFileRoute('/memories')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(memoryStatsQueryOptions),
      context.queryClient.ensureQueryData(semanticMemoriesQueryOptions({ page: 1, pageSize: 12 })),
    ]),
  component: MemoriesPage,
});
