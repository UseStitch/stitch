import { createFileRoute } from '@tanstack/react-router';

import { RecordingsPage } from '@/components/recordings/recordings-page';
import { recordingsInfiniteQueryOptions, recordingsQueryOptions } from '@/lib/queries/recordings';

export const Route = createFileRoute('/recordings/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        recordingsQueryOptions({ page: 1, pageSize: 12, sort: 'startedAt', sortDirection: 'desc' }),
      ),
      context.queryClient.ensureInfiniteQueryData(recordingsInfiniteQueryOptions()),
    ]),
  component: RecordingsPage,
});
