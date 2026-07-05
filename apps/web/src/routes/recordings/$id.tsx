import { createFileRoute } from '@tanstack/react-router';

import { RecordingAnalysisPage } from '@/components/recordings/recording-analysis-page';
import { meetingNoteTemplatesQueryOptions, recordingDetailsQueryOptions } from '@/lib/queries/recordings';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/recordings/$id')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(recordingDetailsQueryOptions(params.id)),
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(meetingNoteTemplatesQueryOptions),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <RecordingAnalysisPage recordingId={id} />;
}
