import { ChevronRightIcon, MicIcon, PauseIcon, PlayIcon, Volume2Icon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Meeting, MeetingStatus } from '@stitch/shared/meetings/types';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialogContext } from '@/context/dialog-context';
import { getAudioUrl, recordingsQueryOptions } from '@/lib/queries/meetings';
import { cn } from '@/lib/utils';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  if (mins === 0) return `${remainder}s`;
  return `${mins}m ${remainder}s`;
}

function formatAppName(app: string): string {
  return app.replace(/\.exe$/i, '');
}

const STATUS_STYLES: Record<MeetingStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-600' },
  recording: { label: 'Recording', className: 'bg-red-500/10 text-red-600' },
  detected: { label: 'Detected', className: 'bg-primary/10 text-primary' },
  dismissed: { label: 'Dismissed', className: 'bg-muted text-muted-foreground' },
};

function StatusBadge({ status }: { status: MeetingStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', style.className)}>
      {style.label}
    </span>
  );
}

function AudioPlayer({ meetingId, track }: { meetingId: string; track: 'mic' | 'speaker' }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getAudioUrl(meetingId, track).then((url) => {
      if (!cancelled) setAudioSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [meetingId, track]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioSrc]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const Icon = track === 'mic' ? MicIcon : Volume2Icon;

  if (!audioSrc) return null;

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />
      <Button variant="ghost" size="icon-sm" onClick={togglePlay} className="shrink-0">
        {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
      </Button>
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <div
        className="h-1.5 flex-1 cursor-pointer rounded-full bg-muted"
        onClick={handleSeek}
        role="slider"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={duration}
        tabIndex={0}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {duration > 0 && (
        <span className="min-w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function RecordingRow({ meeting }: { meeting: Meeting }) {
  const hasAudio = meeting.status === 'completed' && (meeting.micFilePath || meeting.speakerFilePath);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-b border-border/50 px-1 py-3 last:border-0">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 text-left',
          hasAudio && 'cursor-pointer',
        )}
        onClick={() => hasAudio && setExpanded((v) => !v)}
        disabled={!hasAudio}
      >
        {hasAudio && (
          <ChevronRightIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formatAppName(meeting.app)}</span>
            <StatusBadge status={meeting.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(meeting.startedAt)}</span>
            <span>{formatTime(meeting.startedAt)}</span>
            {meeting.durationSecs !== null && (
              <>
                <span className="text-border">|</span>
                <span>{formatDuration(meeting.durationSecs)}</span>
              </>
            )}
          </div>
        </div>
      </button>

      {hasAudio && expanded && (
        <div className="mt-2.5 flex flex-col gap-1.5 pl-6">
          {meeting.micFilePath && <AudioPlayer meetingId={meeting.id} track="mic" />}
          {meeting.speakerFilePath && <AudioPlayer meetingId={meeting.id} track="speaker" />}
        </div>
      )}
    </div>
  );
}

function RecordingsContent() {
  const { data: recordings } = useSuspenseQuery(recordingsQueryOptions);

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MicIcon className="mb-3 size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No recordings yet</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Recordings will appear here when a meeting is detected and recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {recordings.map((recording) => (
        <RecordingRow key={recording.id} meeting={recording} />
      ))}
    </div>
  );
}

export function RecordingsDialog() {
  const { recordingsOpen, setRecordingsOpen } = useDialogContext();

  return (
    <Dialog open={recordingsOpen} onOpenChange={setRecordingsOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recordings</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex h-120 max-w-xl! flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center border-b px-5 py-4">
          <h2 className="text-base font-semibold">Recordings</h2>
        </div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="px-5 py-2">
            <React.Suspense
              fallback={
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              }
            >
              <RecordingsContent />
            </React.Suspense>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
