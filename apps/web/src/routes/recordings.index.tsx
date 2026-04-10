import { createFileRoute } from '@tanstack/react-router';

import { RecordingsPage } from '@/components/recordings/recordings-page';
import { recordingsQueryOptions } from '@/lib/queries/recordings';

export const Route = createFileRoute('/recordings/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(recordingsQueryOptions({ page: 1, pageSize: 10 })),
  component: RecordingsPage,
});
