import { FileTextIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecordingAnalysis, Recording } from '@stitch/shared/recordings/types';
import { statusClassName, statusLabel } from './utils';

interface AnalysisHeaderProps {
  analysis: RecordingAnalysis | null | undefined;
  recording: Recording | undefined;
  isRunning: boolean;
  isStarting: boolean;
  isCancelling: boolean;
  onStartAnalysis: () => void;
  onCancelAnalysis: () => void;
}

export function AnalysisHeader({
  analysis,
  recording,
  isRunning,
  isStarting,
  isCancelling,
  onStartAnalysis,
  onCancelAnalysis,
}: AnalysisHeaderProps) {
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
          <p className="mt-0.5 text-sm text-muted-foreground">
            Summary, extracted topics, decisions, and full transcript.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${statusClassName(
            analysis?.status
          )}`}
        >
          {statusLabel(analysis?.status)}
        </span>
        <Button
          onClick={onStartAnalysis}
          disabled={isStarting || isRunning}
          variant={analysis ? 'outline' : 'default'}
          className="shadow-sm"
        >
          {isStarting || isRunning ? (
            <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
          ) : (
            <SparklesIcon data-icon="inline-start" className="size-4 text-primary" />
          )}
          {analysis ? 'Re-run analysis' : 'Analyze recording'}
        </Button>
        {isRunning && (
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
        )}
      </div>
    </div>
  );
}
