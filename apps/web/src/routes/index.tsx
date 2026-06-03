import { createFileRoute } from '@tanstack/react-router';

import { NewSessionPage } from '@/components/home/new-session-page';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
  component: NewSessionPage,
});
