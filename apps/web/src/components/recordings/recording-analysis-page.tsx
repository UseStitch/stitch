import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { AnalysisHeader } from './analysis/analysis-header';
import { TranscriptSidebar } from './analysis/transcript-sidebar';
import { DeleteRecordingDialog } from './shared/delete-recording-dialog';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { Page, PageContent } from '@/components/ui/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getErrorMessage } from '@/lib/errors';
import {
  recordingDetailsQueryOptions,
  meetingNoteTemplatesQueryOptions,
  useCancelRecordingAnalysis,
  useDeleteRecording,
  useStartRecordingAnalysis,
  useStopRecording,
} from '@/lib/queries/recordings';
import { settingsQueryOptions } from '@/lib/queries/settings';

export function RecordingAnalysisPage({ recordingId }: { recordingId: string }) {
  const { data } = useSuspenseQuery(recordingDetailsQueryOptions(recordingId));
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: templateData } = useSuspenseQuery(meetingNoteTemplatesQueryOptions);

  const startAnalysis = useStartRecordingAnalysis();
  const cancelAnalysis = useCancelRecordingAnalysis();
  const deleteRecording = useDeleteRecording();
  const stopRecording = useStopRecording();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const { analysis, recording } = data;
  const isActiveRecording = recording.id === data.activeRecordingId;
  const defaultTemplateId = settings['recordings.analysis.defaultTemplateId'];
  const defaultTemplate =
    templateData.templates.find((template) => template.id === defaultTemplateId) ?? templateData.templates[0];
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>(defaultTemplate?.id ?? '');
  const selectedTemplate =
    templateData.templates.find((template) => template.id === selectedTemplateId) ?? defaultTemplate;

  const isRunning = analysis?.status === 'processing';

  const deleteRecordingById = React.useCallback(() => {
    void deleteRecording.mutateAsync(recordingId).then(
      () => {
        setShowDeleteConfirm(false);
        toast.success('Recording deleted', { id: 'analysis-recording-delete' });
        void navigate({ to: '/recordings' });
      },
      (error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to delete recording'), { id: 'analysis-recording-delete' }),
    );
  }, [deleteRecording, navigate, recordingId]);

  const handleStartAnalysis = () => {
    if (!selectedTemplate) {
      toast.error('Select a meeting note template first', { id: 'analysis-no-template' });
      return;
    }

    void startAnalysis.mutateAsync({ recordingId, force: true, templateId: selectedTemplate.id }).then(
      () => toast.success('Analysis started', { id: 'analysis-start' }),
      (error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to start recording analysis'), { id: 'analysis-start' }),
    );
  };

  const handleCancelAnalysis = () => {
    void cancelAnalysis.mutateAsync(recordingId).then(
      () => toast.success('Analysis cancelled', { id: 'analysis-cancel' }),
      (error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to cancel recording analysis'), { id: 'analysis-cancel' }),
    );
  };

  return (
    <Page className="overflow-hidden">
      <PageContent className="min-h-0 overflow-hidden">
        <AnalysisHeader
          analysis={analysis}
          analysisMarkdown={analysis?.summary || null}
          recording={recording}
          templates={templateData.templates}
          selectedTemplateId={selectedTemplate?.id ?? ''}
          isRunning={isRunning}
          isStarting={startAnalysis.isPending}
          isCancelling={cancelAnalysis.isPending}
          isDeleting={deleteRecording.isPending}
          isRecording={isActiveRecording}
          isStopping={stopRecording.isPending}
          onStartAnalysis={handleStartAnalysis}
          onTemplateChange={(templateId) => setSelectedTemplateId(templateId)}
          onCancelAnalysis={handleCancelAnalysis}
          onStopRecording={() => {
            void stopRecording.mutateAsync().then(
              () => toast.success('Recording stopped', { id: 'analysis-recording-stop' }),
              (error: unknown) =>
                toast.error(getErrorMessage(error, 'Failed to stop recording'), { id: 'analysis-recording-stop' }),
            );
          }}
          onDelete={() => {
            if (!recording) return;
            setShowDeleteConfirm(true);
          }}
        />

        {analysis?.error ? (
          <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {analysis.error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col lg:col-span-8 lg:pr-2 xl:col-span-8 2xl:col-span-9">
            <ScrollArea className="h-0 flex-1 rounded-xl">
              <div className="space-y-8 pr-6 pb-12">
                {analysis?.summary ? (
                  <div className="rounded-xl border bg-card p-5">
                    <ChatMarkdown text={analysis.summary} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                    {isRunning
                      ? 'Analysis is running. Meeting notes will appear here.'
                      : 'No analysis yet. Choose a template and run analysis to generate meeting notes.'}
                  </div>
                )}
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
      </PageContent>
    </Page>
  );
}
