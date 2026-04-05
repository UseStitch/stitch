import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { RecordingDeleteDialog } from '@/components/recordings/recording-delete-dialog';
import { RecordingDetail } from '@/components/recordings/recording-detail';
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
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const meeting = React.useMemo(() => recordings.find((r) => r.id === id), [recordings, id]);

  if (!meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Recording not found</p>
      </div>
    );
  }

  return (
    <>
      <RecordingDetail key={meeting.id} meeting={meeting} onDelete={() => setDeleteDialogOpen(true)} />
      <RecordingDeleteDialog
        meetingId={meeting.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}
