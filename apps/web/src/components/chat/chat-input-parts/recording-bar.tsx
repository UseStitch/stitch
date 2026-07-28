import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { MicLevelMeter } from './mic-level-meter';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

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
export function RecordingBar({ audioLevel, startedAt, isStopping, onCancel, onStop }: RecordingBarProps) {
  const elapsedMs = useElapsed(startedAt);

  return (
    <output className="flex w-full items-center gap-space-m" aria-live="polite">
      <StatusDot color="destructive" pulse={!isStopping} />
      <Text as="span" variant="label" tone="destructive">
        {isStopping ? 'Transcribing…' : 'Recording'}
      </Text>
      <MicLevelMeter level={isStopping ? 0 : audioLevel} />
      <span className="ml-auto">
        <Text as="span" variant="label" tone="muted" tabular>
          {formatElapsed(elapsedMs)}
        </Text>
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={onCancel}
        disabled={isStopping}
        title="Discard recording"
        className="text-muted-foreground hover:text-foreground">
        <Icon as={XIcon} size="s" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="default"
        onClick={onStop}
        disabled={isStopping}
        title="Stop and insert transcript">
        <Icon as={CheckIcon} size="s" />
      </Button>
    </output>
  );
}
