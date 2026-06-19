import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { MicLevelMeter } from './mic-level-meter';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RecordingBarProps = {
  audioLevel: number;
  startedAt: number | null;
  isStopping: boolean;
  onCancel: () => void;
  onStop: () => void;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/**
 * Replaces the chat input toolbar while dictation is active. Shows an
 * unmistakable recording indicator, a live level meter, elapsed time, and
 * explicit cancel (discard) and stop (finalize) controls.
 */
export function RecordingBar({
  audioLevel,
  startedAt,
  isStopping,
  onCancel,
  onStop,
}: RecordingBarProps) {
  const elapsedMs = useElapsed(startedAt);

  return (
    <div className="flex w-full items-center gap-2" role="status" aria-live="polite">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full bg-destructive',
          !isStopping && 'animate-pulse',
        )}
      />
      <span className="text-xs font-medium text-destructive">
        {isStopping ? 'Transcribing…' : 'Recording'}
      </span>
      <MicLevelMeter level={isStopping ? 0 : audioLevel} />
      <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
        {formatElapsed(elapsedMs)}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={onCancel}
        disabled={isStopping}
        title="Discard recording"
        className="text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="default"
        onClick={onStop}
        disabled={isStopping}
        title="Stop and insert transcript"
      >
        <CheckIcon className="size-3.5" />
      </Button>
    </div>
  );
}
