import { MicIcon, SquareIcon } from 'lucide-react';

import type { Recording } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LiveDurationText } from '../shared/live-duration';

interface RecordingStartStopBarProps {
  activeRecording: Recording | undefined;
  isStarting: boolean;
  isStopping: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingStartStopBar({
  activeRecording,
  isStarting,
  isStopping,
  title,
  onTitleChange,
  onStart,
  onStop,
}: RecordingStartStopBarProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-72 flex-1">
          <label htmlFor="recording-title" className="sr-only">
            Recording title
          </label>
          <Input
            id="recording-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Recording title e.g. Weekly Product Sync"
            disabled={Boolean(activeRecording)}
          />
        </div>

        {activeRecording ? (
          <Button onClick={onStop} disabled={isStopping} variant="destructive">
            <SquareIcon data-icon="inline-start" className="size-4" />
            Stop recording (<LiveDurationText startedAt={activeRecording.startedAt} />)
          </Button>
        ) : (
          <Button onClick={onStart} disabled={isStarting}>
            <MicIcon data-icon="inline-start" className="size-4" />
            Start recording
          </Button>
        )}
      </div>
    </div>
  );
}
