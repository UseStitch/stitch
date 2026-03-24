import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { RecordingDetail } from '@/components/recording-detail';
import { recordingsQueryOptions } from '@/lib/queries/meetings';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';

export const Route = createFileRoute('/recordings/$id')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(recordingsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
    ]),
  component: RecordingDetailComponent,
});

function RecordingDetailComponent() {
  const { id } = Route.useParams();
  const { data: recordings } = useSuspenseQuery(recordingsQueryOptions);

  const meeting = React.useMemo(
    () => recordings.find((r) => r.id === id),
    [recordings, id],
  );

  if (!meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Recording not found</p>
      </div>
    );
  }

  return <RecordingDetail meeting={meeting} />;
}
