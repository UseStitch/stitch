import { MicIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  recordingsQueryOptions,
  useStartRecording,
  useStopRecording,
} from '@/lib/queries/recordings';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

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

function formatBytes(value: number | null): string {
  if (value === null) return '--';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function RecordingsPage() {
  const { data } = useSuspenseQuery(recordingsQueryOptions);
  const startRecording = useStartRecording();
  const stopRecording = useStopRecording();
  const [title, setTitle] = React.useState('');
  const [tick, setTick] = React.useState(Date.now());

  useQuery({
    ...recordingsQueryOptions,
    refetchInterval: data.activeRecordingId ? 1_000 : 2_000,
  });

  React.useEffect(() => {
    if (!data.activeRecordingId) {
      return;
    }

    const id = setInterval(() => {
      setTick(Date.now());
    }, 1_000);

    return () => clearInterval(id);
  }, [data.activeRecordingId]);

  const activeRecording = data.recordings.find((recording) => recording.id === data.activeRecordingId);

  const activeDuration = activeRecording ? tick - activeRecording.startedAt : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MicIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Recordings</h1>
              <p className="text-sm text-muted-foreground">
                Record any meeting and store raw audio in your local app data directory.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1 space-y-2">
              <label htmlFor="recording-title" className="text-xs font-medium text-muted-foreground">
                Recording title
              </label>
              <Input
                id="recording-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Weekly Product Sync"
                disabled={Boolean(activeRecording)}
              />
            </div>

            {activeRecording ? (
              <Button
                onClick={() => {
                  void stopRecording.mutateAsync().then(
                    () => toast.success('Recording stopped'),
                    (error: unknown) => {
                      toast.error(error instanceof Error ? error.message : 'Failed to stop recording');
                    },
                  );
                }}
                disabled={stopRecording.isPending}
                variant="destructive"
              >
                <SquareIcon data-icon="inline-start" className="size-4" />
                Stop recording ({formatDuration(activeDuration)})
              </Button>
            ) : (
              <Button
                onClick={() => {
                  void startRecording.mutateAsync({ title: title.trim() || undefined }).then(
                    () => {
                      setTitle('');
                      toast.success('Recording started');
                    },
                    (error: unknown) => {
                      toast.error(error instanceof Error ? error.message : 'Failed to start recording');
                    },
                  );
                }}
                disabled={startRecording.isPending}
              >
                <MicIcon data-icon="inline-start" className="size-4" />
                Start recording
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Path</th>
              </tr>
            </thead>
            <tbody>
              {data.recordings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No recordings yet.
                  </td>
                </tr>
              ) : (
                data.recordings.map((recording) => (
                  <tr key={recording.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{recording.title}</td>
                    <td className="px-3 py-2">{recording.status}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(recording.startedAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {recording.id === data.activeRecordingId
                        ? formatDuration(activeDuration)
                        : formatDuration(recording.durationMs)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatBytes(recording.fileSizeBytes)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{recording.filePath}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
