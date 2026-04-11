import { createFileRoute } from '@tanstack/react-router';

import { RecordingAnalysisPage } from '@/components/recordings/recording-analysis-page';
import { recordingAnalysisQueryOptions } from '@/lib/queries/recordings';

export const Route = createFileRoute('/recordings/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recordingAnalysisQueryOptions(params.id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <RecordingAnalysisPage recordingId={id} />;
}
