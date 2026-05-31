import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { Recording, RecordingAnalysis } from '@stitch/shared/recordings/types';

import { AnalysisHeader } from './analysis/analysis-header';
import { SummarySection } from './analysis/summary-section';
import { TopicList } from './analysis/topic-list';
import { TranscriptSidebar } from './analysis/transcript-sidebar';

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
  useStopRecording,
} from '@/lib/queries/recordings';

const ACTION_STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  unknown: 'Unknown',
};

function pushList(lines: string[], title: string, items: string[]): void {
  if (!items.length) return;
  lines.push(`**${title}**`);
  lines.push(...items.map((item) => `- ${item}`));
  lines.push('');
}

function buildAnalysisMarkdown(
  analysis: RecordingAnalysis | null | undefined,
  recording: Recording | undefined,
): string | null {
  if (!analysis) return null;

  const lines: string[] = [];
  const title = analysis.title || recording?.title || 'Recording analysis';

  lines.push(`# ${title}`);
  lines.push('');

  if (analysis.summary.trim()) {
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(analysis.summary.trim());
    lines.push('');
  }

  if (analysis.topicSections.length) {
    lines.push('## Topic Analysis');
    lines.push('');

    analysis.topicSections.forEach((section, index) => {
      lines.push(`### ${index + 1}. ${section.name}`);
      lines.push('');
      lines.push(`**Turns:** ${section.startTurn + 1}-${section.endTurn + 1}`);
      lines.push('');

      if (section.analysis.trim()) {
        lines.push(section.analysis.trim());
        lines.push('');
      }

      pushList(lines, 'Decisions', section.decisions);

      if (section.actionItems.length) {
        const actionItems = section.actionItems.map((item) => {
          const metadata = [
            `assignee: ${item.assignee ?? 'Unassigned'}`,
            item.dueDate ? `due: ${item.dueDate}` : null,
            `status: ${ACTION_STATUS_LABEL[item.status] ?? item.status}`,
          ].filter(Boolean);

          return `${item.task} (${metadata.join('; ')})`;
        });

        pushList(lines, 'Action Items', actionItems);
      }

      if (section.blockers.length) {
        const blockers = section.blockers.map((blocker) => {
          const metadata = [
            `assignee: ${blocker.assignee ?? 'Unassigned'}`,
            `impact: ${blocker.impact ?? 'Unknown'}`,
          ];
          return `${blocker.description} (${metadata.join('; ')})`;
        });

        pushList(lines, 'Risks & Blockers', blockers);
      }

      pushList(lines, 'Open Questions', section.openQuestions);
      pushList(lines, 'Next Steps', section.nextSteps);
    });
  }

  if (analysis.blockers.length) {
    const blockers = analysis.blockers.map((blocker) => {
      const metadata = [
        `assignee: ${blocker.assignee ?? 'Unassigned'}`,
        `impact: ${blocker.impact ?? 'Unknown'}`,
      ];

      return `${blocker.description} (${metadata.join('; ')})`;
    });

    lines.push('## Overall Risks & Blockers');
    lines.push('');
    lines.push(...blockers.map((blocker) => `- ${blocker}`));
    lines.push('');
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  const isRunning = analysis?.status === 'pending' || analysis?.status === 'processing';

  const handleStartAnalysis = () => {
    void startAnalysis.mutateAsync({ recordingId, force: true }).then(
      () => toast.success('Analysis started'),
      (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Failed to start recording analysis'),
    );
  };

  const handleCancelAnalysis = () => {
    void cancelAnalysis.mutateAsync(recordingId).then(
      () => toast.success('Analysis cancelled'),
      (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Failed to cancel recording analysis'),
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-400 flex-col gap-6 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
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
            (error: unknown) =>
              toast.error(error instanceof Error ? error.message : 'Failed to stop recording'),
          );
        }}
        onDelete={() => {
          if (
            recording?.durationMs !== null &&
            recording?.durationMs !== undefined &&
            recording.durationMs <= 30_000
          ) {
            void deleteRecording.mutateAsync(recordingId).then(
              () => {
                toast.success('Recording deleted');
                void navigate({ to: '/recordings' });
              },
              (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Failed to delete recording'),
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
            <div className="space-y-8 pr-2 pb-12">
              <SummarySection analysis={analysis} isRunning={isRunning} />
              <TopicList sections={analysis?.topicSections} isRunning={isRunning} />
            </div>
          </ScrollArea>
        </div>

        {/* Right Column - Full Height Transcript */}
        <div className="min-h-0 lg:col-span-4 xl:col-span-4 2xl:col-span-3">
          <TranscriptSidebar
            analysis={analysis}
            isRunning={isRunning}
            recordingId={recordingId}
            isRecording={recording?.status === 'recording'}
          />
        </div>
      </div>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
      >
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
                  (error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : 'Failed to delete recording',
                    ),
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
