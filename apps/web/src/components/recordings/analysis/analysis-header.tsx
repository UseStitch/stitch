import {
  FileTextIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import type { RecordingAnalysis, Recording } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Progress } from '@/components/ui/progress';
import { getServerUrl } from '@/lib/api';

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '--';

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function AudioPlayer({
  recordingId,
  durationMs,
}: {
  recordingId: string;
  durationMs: number | null;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [src, setSrc] = React.useState<string | null>(null);
  const actualDuration = durationMs ? durationMs / 1000 : 0;

  React.useEffect(() => {
    let active = true;
    void getServerUrl().then((url) => {
      if (active) {
        setSrc(`${url}/recordings/${recordingId}/audio`);
      }
    });
    return () => {
      active = false;
    };
  }, [recordingId]);

  React.useEffect(() => {
    if (!src) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }

    const audio = new Audio(src);
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(actualDuration);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handlePlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [src, actualDuration]);

  const progressValue =
    actualDuration > 0 ? Math.min((currentTime / actualDuration) * 100, 100) : 0;

  const start = React.useCallback(() => {
    if (!audioRef.current) return;
    void audioRef.current.play().catch(() => {
      toast.error('Could not start playback');
    });
  }, []);

  const stop = React.useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  }, []);

  const reset = React.useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  }, []);

  if (!src) return null;

  return (
    <div className="flex h-8 w-48 items-center gap-1 rounded-lg border border-border/60 bg-background px-1.5 shadow-sm">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={isPlaying ? stop : start}
        aria-label={isPlaying ? 'Pause playback' : 'Play recording'}
        className="shrink-0"
      >
        {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <Progress value={progressValue} className="mt-0.5 h-1.5" aria-label="Playback progress" />
        <div className="flex items-center justify-between text-[10px] leading-none text-muted-foreground tabular-nums">
          <span>{formatDuration(currentTime * 1000)}</span>
          <span>{formatDuration(actualDuration * 1000)}</span>
        </div>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={reset}
        disabled={currentTime === 0 && !isPlaying}
        aria-label="Reset playback"
        className="shrink-0"
      >
        <RotateCcwIcon className="size-3.5" />
      </Button>
    </div>
  );
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
