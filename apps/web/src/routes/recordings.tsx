import { createFileRoute } from '@tanstack/react-router';

import { RecordingsPage } from '@/components/recordings/recordings-page';
import { recordingsQueryOptions } from '@/lib/queries/recordings';

export const Route = createFileRoute('/recordings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(recordingsQueryOptions),
  component: RecordingsPage,
});
