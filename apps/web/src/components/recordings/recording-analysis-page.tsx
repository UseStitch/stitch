import { toast } from 'sonner';
import { useSuspenseQuery } from '@tanstack/react-query';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  recordingAnalysisQueryOptions,
  recordingsQueryOptions,
  useCancelRecordingAnalysis,
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
        onStartAnalysis={handleStartAnalysis}
        onCancelAnalysis={handleCancelAnalysis}
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
            <div className="space-y-8 pb-12 pr-4">
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
    </div>
  );
}
