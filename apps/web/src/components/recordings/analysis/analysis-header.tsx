import { FileTextIcon, Loader2Icon, SparklesIcon, SquareIcon, Trash2Icon } from 'lucide-react';

import type { RecordingAnalysis, Recording } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import {
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import { formatUsdCost } from '@/lib/format-cost';

function formatCost(costUsd: number | null | undefined): string | null {
  if (costUsd === null || costUsd === undefined) return null;
  return formatUsdCost(costUsd);
}

interface AnalysisHeaderProps {
  analysis: RecordingAnalysis | null | undefined;
  analysisMarkdown: string | null;
  recording: Recording | undefined;
  isRunning: boolean;
  isStarting: boolean;
  isCancelling: boolean;
  isDeleting: boolean;
  isRecording?: boolean;
  isStopping?: boolean;
  onStartAnalysis: () => void;
  onCancelAnalysis: () => void;
  onDelete: () => void;
  onStopRecording?: () => void;
}

export function AnalysisHeader({
  analysis,
  analysisMarkdown,
  recording,
  isRunning,
  isStarting,
  isCancelling,
  isDeleting,
  isRecording,
  isStopping,
  onStartAnalysis,
  onCancelAnalysis,
  onDelete,
  onStopRecording,
}: AnalysisHeaderProps) {
  const showRecordingControls = isRecording && onStopRecording;
  const hasCompletedAnalysis = analysis?.status === 'completed';
  const costLabel = formatCost(analysis?.costUsd ?? recording?.costUsd);

  return (
    <PageHeader className="shrink-0">
      <PageHeaderContent>
        <PageIcon>
          <FileTextIcon className="size-5" />
        </PageIcon>
        <div>
          <PageTitle>{analysis?.title || recording?.title || 'Recording analysis'}</PageTitle>
          {costLabel ? (
            <PageDescription className="text-xs tabular-nums">
              Recording cost {costLabel}
            </PageDescription>
          ) : null}
        </div>
      </PageHeaderContent>
      <div className="flex items-center gap-3">
        {showRecordingControls ? (
          <Button
            onClick={onStopRecording}
            disabled={isStopping}
            variant="destructive"
            className="shadow-sm"
          >
            <SquareIcon data-icon="inline-start" className="size-4" />
            Stop
          </Button>
        ) : null}
        {!showRecordingControls && analysisMarkdown ? (
          <CopyButton
            value={analysisMarkdown}
            copyLabel="Copy analysis markdown"
            copiedLabel="Copied analysis"
            className="shadow-sm"
          />
        ) : null}
        {!showRecordingControls ? (
          <Button
            onClick={onStartAnalysis}
            disabled={isStarting || isRunning}
            variant={hasCompletedAnalysis ? 'outline' : 'default'}
            className="shadow-sm"
          >
            {isStarting || isRunning ? (
              <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
            ) : (
              <SparklesIcon data-icon="inline-start" className="size-4" />
            )}
            {hasCompletedAnalysis ? 'Re-run analysis' : 'Analyze recording'}
          </Button>
        ) : null}
        {!showRecordingControls ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting || isRunning || isRecording}
            aria-label="Delete recording"
            className="text-destructive shadow-sm hover:text-destructive"
          >
            {isDeleting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Trash2Icon className="size-4" />
            )}
          </Button>
        ) : null}
        {!showRecordingControls && isRunning ? (
          <Button
            variant="destructive"
            onClick={onCancelAnalysis}
            disabled={isCancelling}
            className="shadow-sm"
          >
            {isCancelling ? (
              <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
            ) : null}
            Cancel
          </Button>
        ) : null}
      </div>
    </PageHeader>
  );
}
