import { PauseIcon, PlayIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { getAudioUrl } from '@/lib/queries/meetings';

import { formatDuration } from '@/components/recordings/recording-detail/formatting';

export function AudioPlayer({ meetingId }: { meetingId: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getAudioUrl(meetingId).then((url) => {
      if (!cancelled) setAudioSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

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

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  if (!audioSrc) return null;

  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-2 sm:w-auto sm:min-w-48">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />
      <Button variant="ghost" size="icon-sm" onClick={togglePlay} className="size-7 shrink-0">
        {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
      </Button>
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
        <span className="min-w-10 pr-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}
