import * as React from 'react';
import { toast } from 'sonner';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  recordingAnalysisQueryOptions,
  recordingsQueryOptions,
  useCancelRecordingAnalysis,
  useDeleteRecording,
  useStartRecordingAnalysis,
} from '@/lib/queries/recordings';

import { AnalysisHeader } from './analysis/analysis-header';
import { SummarySection } from './analysis/summary-section';
import { TopicList } from './analysis/topic-list';
import { TranscriptSidebar } from './analysis/transcript-sidebar';

export function RecordingAnalysisPage({ recordingId }: { recordingId: string }) {
  const { data: analysisResponse } = useSuspenseQuery(recordingAnalysisQueryOptions(recordingId));
  const { data: recordings } = useSuspenseQuery(recordingsQueryOptions({ page: 1, pageSize: 100 }));
  
  const startAnalysis = useStartRecordingAnalysis();
  const cancelAnalysis = useCancelRecordingAnalysis();
  const deleteRecording = useDeleteRecording();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const analysis = analysisResponse.analysis;
  const recording = recordings.recordings.find((item) => item.id === recordingId);

  const isRunning = analysis?.status === 'pending' || analysis?.status === 'processing';

  const handleStartAnalysis = () => {
    void startAnalysis.mutateAsync({ recordingId, force: true }).then(
      () => toast.success('Analysis started'),
      (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to start recording analysis')
    );
  };

  const handleCancelAnalysis = () => {
    void cancelAnalysis.mutateAsync(recordingId).then(
      () => toast.success('Analysis cancelled'),
      (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to cancel recording analysis')
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-400 flex-col gap-6 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <AnalysisHeader
        analysis={analysis}
        recording={recording}
        isRunning={isRunning}
        isStarting={startAnalysis.isPending}
        isCancelling={cancelAnalysis.isPending}
        isDeleting={deleteRecording.isPending}
        onStartAnalysis={handleStartAnalysis}
        onCancelAnalysis={handleCancelAnalysis}
        onDelete={() => {
          if (recording?.durationMs !== null && recording?.durationMs !== undefined && recording.durationMs <= 30_000) {
            void deleteRecording.mutateAsync(recordingId).then(
              () => {
                toast.success('Recording deleted');
                void navigate({ to: '/recordings' });
              },
              (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to delete recording'),
            );
          } else {
            setShowDeleteConfirm(true);
          }
        }}
      />

      {analysis?.error && analysis.error !== 'Analysis cancelled by user' ? (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {analysis.error}
        </div>
      ) : null}

      {/* Main Layout Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* Left Column - Summary & Topics (Scrollable) */}
        <div className="flex min-h-0 flex-col lg:col-span-8 xl:col-span-8 2xl:col-span-9">
          <ScrollArea className="flex-1 rounded-xl" style={{ height: 0 }}>
            <div className="space-y-8 pb-12 pr-2">
              <SummarySection analysis={analysis} isRunning={isRunning} />
              <TopicList sections={analysis?.topicSections} isRunning={isRunning} />
            </div>
          </ScrollArea>
        </div>

        {/* Right Column - Full Height Transcript */}
        <div className="min-h-0 lg:col-span-4 xl:col-span-4 2xl:col-span-3">
          <TranscriptSidebar analysis={analysis} isRunning={isRunning} />
        </div>
        
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={(open) => !open && setShowDeleteConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recording?</DialogTitle>
            <DialogDescription>
              This permanently deletes &quot;{recording?.title}&quot; and its local audio file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void deleteRecording.mutateAsync(recordingId).then(
                  () => {
                    setShowDeleteConfirm(false);
                    toast.success('Recording deleted');
                    void navigate({ to: '/recordings' });
                  },
                  (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to delete recording'),
                );
              }}
              disabled={deleteRecording.isPending}
            >
              {deleteRecording.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
