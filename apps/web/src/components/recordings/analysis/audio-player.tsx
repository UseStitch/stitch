import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getServerUrl } from '@/lib/api';

import { formatClockDuration } from '../shared/formatting';

export function AudioPlayer({
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
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(actualDuration);
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

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
          <span>{formatClockDuration(currentTime * 1000)}</span>
          <span>{formatClockDuration(actualDuration * 1000)}</span>
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
