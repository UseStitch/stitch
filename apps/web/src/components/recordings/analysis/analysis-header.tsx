import { FileTextIcon, Loader2Icon, SparklesIcon, SquareIcon, Trash2Icon } from 'lucide-react';

import type { RecordingAnalysis, Recording } from '@stitch/shared/recordings/types';

import { AudioPlayer } from './audio-player';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';

function formatCost(costUsd: number | null | undefined): string | null {
  if (costUsd === null || costUsd === undefined) return null;
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
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
  const showPlayer = recording?.status === 'completed' && recording.id;
  const showRecordingControls = isRecording && onStopRecording;
  const hasCompletedAnalysis = analysis?.status === 'completed';
  const costLabel = formatCost(analysis?.costUsd ?? recording?.costUsd);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
          <FileTextIcon className="size-5.5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {analysis?.title || recording?.title || 'Recording analysis'}
          </h1>
          {costLabel ? (
            <p className="text-xs text-muted-foreground tabular-nums">Recording cost {costLabel}</p>
          ) : null}
        </div>
      </div>
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
        {!showRecordingControls && showPlayer ? (
          <AudioPlayer recordingId={recording.id} durationMs={recording.durationMs} />
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
    </div>
  );
}
