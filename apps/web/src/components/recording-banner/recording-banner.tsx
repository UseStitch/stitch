import { CheckIcon, MicIcon, SquareIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { useAcceptMeeting, useDismissMeeting, useStopRecording } from '@/lib/queries/meetings';
import { cn } from '@/lib/utils';
import { useMeetingStore } from '@/stores/meeting-store';

function formatAppName(app: string): string {
  return app.replace(/\.exe$/i, '');
}

function formatElapsed(elapsed: number): string {
  const safeElapsed = Math.max(0, elapsed);
  const mins = Math.floor(safeElapsed / 60);
  const secs = safeElapsed % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  if (mins === 0) return `${remainder}s`;
  return `${mins}m ${remainder}s`;
}

function RecordingDot() {
  return (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
    </span>
  );
}

function DetectedBanner() {
  const meeting = useMeetingStore((s) => s.meeting);
  const acceptMeeting = useAcceptMeeting();
  const dismissMeeting = useDismissMeeting();

  if (!meeting) return null;

  const appName = formatAppName(meeting.app);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <MicIcon className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        Meeting started on <span className="font-medium">{appName}</span>. Record?
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => dismissMeeting.mutate(meeting.meetingId)}
          disabled={dismissMeeting.isPending}
        >
          <XIcon data-icon="inline-start" className="size-3" />
          Dismiss
        </Button>
        <Button
          variant="default"
          size="xs"
          onClick={() => acceptMeeting.mutate(meeting.meetingId)}
          disabled={acceptMeeting.isPending}
        >
          Record
        </Button>
      </div>
    </div>
  );
}

function RecordingBannerContent() {
  const meeting = useMeetingStore((s) => s.meeting);
  const stopRecording = useStopRecording();
  const [elapsedSecs, setElapsedSecs] = React.useState(0);

  React.useEffect(() => {
    if (!meeting) {
      setElapsedSecs(0);
      return;
    }

    const syncElapsed = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - meeting.startedAt) / 1000));
      setElapsedSecs(elapsed);
    };

    syncElapsed();
    const interval = setInterval(syncElapsed, 1000);
    return () => clearInterval(interval);
  }, [meeting]);

  if (!meeting) return null;

  const appName = formatAppName(meeting.app);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <RecordingDot />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        Recording <span className="font-medium">{appName}</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatElapsed(elapsedSecs)}
      </span>
      <Button
        variant="destructive"
        size="xs"
        onClick={() => stopRecording.mutate(meeting.meetingId)}
        disabled={stopRecording.isPending}
      >
        <SquareIcon data-icon="inline-start" className="size-3" />
        {stopRecording.isPending ? 'Stopping...' : 'Stop'}
      </Button>
    </div>
  );
}

function FinishedBanner() {
  const durationSecs = useMeetingStore((s) => s.finishedDurationSecs);
  const clear = useMeetingStore((s) => s.clear);

  React.useEffect(() => {
    const timeout = setTimeout(clear, 3000);
    return () => clearTimeout(timeout);
  }, [clear]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <CheckIcon className="size-4 shrink-0 text-success" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        Recording finished
        {durationSecs !== null && (
          <span className="text-muted-foreground"> ({formatDuration(durationSecs)})</span>
        )}
      </span>
    </div>
  );
}

export function RecordingBanner() {
  const status = useMeetingStore((s) => s.status);
  const [visible, setVisible] = React.useState(false);
  const [rendered, setRendered] = React.useState(false);

  const isActive = status !== 'idle';

  React.useEffect(() => {
    if (isActive) {
      setRendered(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isActive]);

  const handleTransitionEnd = React.useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (!isActive && !visible && event.propertyName === 'grid-template-rows') {
        setRendered(false);
      }
    },
    [isActive, visible],
  );

  if (!rendered) return null;

  return (
    <div
      className={cn(
        'grid border-b border-border/60 transition-[grid-template-rows,opacity]',
        visible
          ? 'duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] opacity-100'
          : 'duration-200 ease-in opacity-0',
        status === 'recording' && 'bg-destructive/10',
        status === 'detected' && 'bg-primary/5',
        status === 'finished' && 'bg-success/10',
      )}
      style={{ gridTemplateRows: visible ? '1fr' : '0fr' }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="min-h-0 overflow-hidden">
        {status === 'detected' && <DetectedBanner />}
        {status === 'recording' && <RecordingBannerContent />}
        {status === 'finished' && <FinishedBanner />}
      </div>
    </div>
  );
}
