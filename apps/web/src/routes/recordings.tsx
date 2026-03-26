import { Outlet, createFileRoute } from '@tanstack/react-router';

import { recordingsQueryOptions } from '@/lib/queries/meetings';

export const Route = createFileRoute('/recordings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(recordingsQueryOptions),
  component: RecordingsLayout,
});

function RecordingsLayout() {
  return <Outlet />;
}
