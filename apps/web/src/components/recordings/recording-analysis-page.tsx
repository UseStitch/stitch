import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { AnalysisHeader } from './analysis/analysis-header';
import { buildAnalysisMarkdown } from './analysis/build-analysis-markdown';
import { SummarySection } from './analysis/summary-section';
import { TopicList } from './analysis/topic-list';
import { TranscriptSidebar } from './analysis/transcript-sidebar';
import { getErrorMessage, shouldConfirmRecordingDelete } from './shared/actions';
import { DeleteRecordingDialog } from './shared/delete-recording-dialog';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  recordingAnalysisQueryOptions,
  recordingsQueryOptions,
  useCancelRecordingAnalysis,
  useDeleteRecording,
  useStartRecordingAnalysis,
  useStopRecording,
} from '@/lib/queries/recordings';

export function RecordingAnalysisPage({ recordingId }: { recordingId: string }) {
  const { data: analysisResponse } = useSuspenseQuery(recordingAnalysisQueryOptions(recordingId));
  const { data: recordings } = useSuspenseQuery(recordingsQueryOptions({ page: 1, pageSize: 100 }));

  const startAnalysis = useStartRecordingAnalysis();
  const cancelAnalysis = useCancelRecordingAnalysis();
  const deleteRecording = useDeleteRecording();
  const stopRecording = useStopRecording();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const analysis = analysisResponse.analysis;
  const recording = recordings.recordings.find((item) => item.id === recordingId);
  const isActiveRecording = recording?.id === recordings.activeRecordingId;
  const analysisMarkdown = React.useMemo(
    () => buildAnalysisMarkdown(analysis, recording),
    [analysis, recording],
  );

  const isRunning = analysis?.status === 'processing';

  const deleteRecordingById = React.useCallback(() => {
    void deleteRecording.mutateAsync(recordingId).then(
      () => {
        setShowDeleteConfirm(false);
        toast.success('Recording deleted');
        void navigate({ to: '/recordings' });
      },
      (error: unknown) => toast.error(getErrorMessage(error, 'Failed to delete recording')),
    );
  }, [deleteRecording, navigate, recordingId]);

  const handleStartAnalysis = () => {
    void startAnalysis.mutateAsync({ recordingId, force: true }).then(
      () => toast.success('Analysis started'),
      (error: unknown) => toast.error(getErrorMessage(error, 'Failed to start recording analysis')),
    );
  };

  const handleCancelAnalysis = () => {
    void cancelAnalysis.mutateAsync(recordingId).then(
      () => toast.success('Analysis cancelled'),
      (error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to cancel recording analysis')),
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-400 flex-col gap-6 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <AnalysisHeader
        analysis={analysis}
        analysisMarkdown={analysisMarkdown}
        recording={recording}
        isRunning={isRunning}
        isStarting={startAnalysis.isPending}
        isCancelling={cancelAnalysis.isPending}
        isDeleting={deleteRecording.isPending}
        isRecording={isActiveRecording}
        isStopping={stopRecording.isPending}
        onStartAnalysis={handleStartAnalysis}
        onCancelAnalysis={handleCancelAnalysis}
        onStopRecording={() => {
          void stopRecording.mutateAsync().then(
            () => toast.success('Recording stopped'),
            (error: unknown) => toast.error(getErrorMessage(error, 'Failed to stop recording')),
          );
        }}
        onDelete={() => {
          if (!recording || shouldConfirmRecordingDelete(recording)) {
            setShowDeleteConfirm(true);
            return;
          }

          deleteRecordingById();
        }}
      />

      {analysis?.error && analysis.error !== 'Analysis cancelled by user' ? (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {analysis.error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col lg:col-span-8 xl:col-span-8 2xl:col-span-9">
          <ScrollArea className="h-0 flex-1 rounded-xl">
            <div className="space-y-8 pr-2 pb-12">
              <SummarySection analysis={analysis} isRunning={isRunning} />
              <TopicList sections={analysis?.topicSections} isRunning={isRunning} />
            </div>
          </ScrollArea>
        </div>

        <div className="min-h-0 lg:col-span-4 xl:col-span-4 2xl:col-span-3">
          <TranscriptSidebar
            analysis={analysis}
            isRunning={isRunning}
            recordingId={recordingId}
            isRecording={recording?.status === 'recording'}
          />
        </div>
      </div>

      <DeleteRecordingDialog
        recording={showDeleteConfirm ? recording : null}
        isDeleting={deleteRecording.isPending}
        onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
        onConfirm={deleteRecordingById}
      />
    </div>
  );
}
