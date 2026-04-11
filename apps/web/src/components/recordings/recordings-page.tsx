import {
  CheckIcon,
  CopyIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Recording, RecordingPlatform } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { SimpleIcon } from '@/components/ui/simple-icon';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import { getServerUrl } from '@/lib/api';
import {
  recordingsQueryOptions,
  useDeleteRecording,
  useStartRecording,
  useStopRecording,
} from '@/lib/queries/recordings';

const PLATFORM_CONFIG: Record<RecordingPlatform, { label: string; slug: string | null }> = {
  manual: { label: 'Manual', slug: null },
  zoom: { label: 'Zoom', slug: 'zoom' },
  teams: { label: 'Teams', slug: 'microsoftteams' },
  slack: { label: 'Slack', slug: 'slack' },
  discord: { label: 'Discord', slug: 'discord' },
  'google-meet': { label: 'Google Meet', slug: 'googlemeet' },
};

const PlatformBadge = React.memo(function PlatformBadge({ platform }: { platform: RecordingPlatform }) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.manual;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {config.slug ? (
        <SimpleIcon
          slug={config.slug}
          className="size-3.5"
          fallback={<VideoIcon className="size-3.5" />}
        />
      ) : (
        <VideoIcon className="size-3.5" />
      )}
      <span>{config.label}</span>
    </span>
  );
});

function LiveDuration({ startedAt }: { startedAt: number }) {
  const [tick, setTick] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-xs text-muted-foreground">{formatDuration(tick - startedAt)}</span>
  );
}

function LiveDurationText({ startedAt }: { startedAt: number }) {
  const [tick, setTick] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  return <>{formatDuration(tick - startedAt)}</>;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

const columnHelper = createColumnHelper<Recording>();

function RecordingPreview({ src, durationMs }: { src: string | null; durationMs: number | null }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const actualDuration = durationMs ? durationMs / 1000 : 0;

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

  const progressValue = actualDuration > 0 ? Math.min((currentTime / actualDuration) * 100, 100) : 0;

  const start = React.useCallback(() => {
    if (!audioRef.current) return;
    void audioRef.current.play().catch(() => {
      toast.error('Could not start preview playback');
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

  if (!src) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <div className="flex w-48 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={isPlaying ? stop : start}
        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        className="shrink-0"
      >
        {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <Progress value={progressValue} className="h-1.5" aria-label="Preview playback progress" />
        <div className="flex items-center justify-between text-[10px] tabular-nums leading-none text-muted-foreground">
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
        aria-label="Reset preview"
        className="shrink-0"
      >
        <RotateCcwIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function RecordingCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast.success('File path copied');
          },
          () => toast.error('Failed to copy file path'),
        );
      }}
      title="Copy path"
      aria-label="Copy path"
    >
      <span className="relative inline-flex size-4">
        <CopyIcon
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
          }`}
        />
        <CheckIcon
          className={`text-success absolute inset-0 size-4 transition-all duration-200 ${
            copied ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}
        />
      </span>
    </Button>
  );
}

export function RecordingsPage() {
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const { data } = useSuspenseQuery(recordingsQueryOptions({ page, pageSize }));
  const startRecording = useStartRecording();
  const stopRecording = useStopRecording();
  const deleteRecording = useDeleteRecording();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'startedAt', desc: true }]);
  const [title, setTitle] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState<string | null>(null);
  const [recordingToDelete, setRecordingToDelete] = React.useState<Recording | null>(null);
  const navigate = useNavigate();

  useQuery({
    ...recordingsQueryOptions({ page, pageSize }),
    refetchInterval: data.activeRecordingId ? 1_000 : 2_000,
  });

  React.useEffect(() => {
    let active = true;
    void getServerUrl().then((url) => {
      if (active) {
        setBaseUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const activeRecording = data.recordings.find((recording) => recording.id === data.activeRecordingId);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: ({ row }) => {
          const displayTitle = row.original.analysisTitle || row.original.title;
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{displayTitle}</span>
            </div>
          );
        },
      }),
      columnHelper.accessor('platform', {
        header: 'Platform',
        cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
      }),
      columnHelper.accessor('status', {
        header: 'Capturing',
        cell: ({ getValue }) => <span className="text-xs capitalize text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.accessor('startedAt', {
        header: 'Date',
        cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue())}</span>,
      }),
      columnHelper.display({
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => {
          const recording = row.original;
          if (recording.id === data.activeRecordingId) {
            return <LiveDuration startedAt={recording.startedAt} />;
          }
          return <span className="text-xs text-muted-foreground">{formatDuration(recording.durationMs)}</span>;
        },
      }),
      columnHelper.display({
        id: 'preview',
        header: 'Preview',
        cell: ({ row }) => (
          <div className="-ml-2">
            <RecordingPreview
              src={
                baseUrl && row.original.status === 'completed'
                  ? `${baseUrl}/recordings/${row.original.id}/audio`
                  : null
              }
              durationMs={row.original.durationMs}
            />
          </div>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <div className="text-right pr-1">Actions</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1 -mr-1.5">
            <RecordingCopyButton value={row.original.filePath} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                const rec = row.original;
                if (rec.durationMs !== null && rec.durationMs <= 30_000) {
                  void deleteRecording.mutateAsync(rec.id).then(
                    () => toast.success('Recording deleted'),
                    (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to delete recording'),
                  );
                } else {
                  setRecordingToDelete(rec);
                }
              }}
              title="Delete recording"
              aria-label="Delete recording"
              disabled={row.original.id === data.activeRecordingId}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [baseUrl, data.activeRecordingId],
  );

  const table = useReactTable({
    data: data.recordings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const pageCount = data.totalPages;
  const currentPage = page - 1;
  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 1) {
      return [] as number[];
    }

    const firstPage = 0;
    const lastPage = pageCount - 1;
    const start = Math.max(firstPage, currentPage - 1);
    const end = Math.min(lastPage, currentPage + 1);

    const pages = new Set<number>([firstPage, lastPage]);
    for (let index = start; index <= end; index += 1) {
      pages.add(index);
    }

    return [...pages].sort((a, b) => a - b);
  }, [currentPage, pageCount]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-72 flex-1">
              <label htmlFor="recording-title" className="sr-only">
                Recording title
              </label>
              <Input
                id="recording-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Recording title e.g. Weekly Product Sync"
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
                Stop recording (<LiveDurationText startedAt={activeRecording.startedAt} />)
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

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={
                          header.column.id === 'title'
                            ? 'w-full min-w-62.5 px-4 py-2 font-medium'
                            : 'whitespace-nowrap px-4 py-2 font-medium'
                        }
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length}>
                      <Empty>
                        <EmptyMedia>
                          <MicIcon className="size-10 text-muted-foreground/30" />
                        </EmptyMedia>
                        <EmptyTitle>No recordings yet</EmptyTitle>
                        <EmptyDescription>
                          Start recording to capture your first meeting audio.
                        </EmptyDescription>
                      </Empty>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="group cursor-pointer align-middle transition-colors hover:bg-muted/40"
                      onClick={() => void navigate({ to: '/recordings/$id', params: { id: row.original.id } })}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={
                            cell.column.id === 'title' ? 'w-full min-w-62.5 px-4 py-3' : 'whitespace-nowrap px-4 py-3'
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <div className="border-t border-border px-3 py-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) {
                          setPage((current) => current - 1);
                        }
                      }}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>

                  {pageNumbers.map((page, index) => {
                    const previousPage = pageNumbers[index - 1];
                    const showGap = previousPage !== undefined && page - previousPage > 1;
                    return (
                      <React.Fragment key={`page-${page}`}>
                        {showGap ? (
                          <PaginationItem>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : null}
                        <PaginationItem>
                          <PaginationLink
                            href="#"
                            isActive={page === currentPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setPage(page + 1);
                            }}
                          >
                            {page + 1}
                          </PaginationLink>
                        </PaginationItem>
                      </React.Fragment>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page < pageCount) {
                          setPage((current) => current + 1);
                        }
                      }}
                      className={page >= pageCount ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={recordingToDelete !== null} onOpenChange={(open) => !open && setRecordingToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recording?</DialogTitle>
            <DialogDescription>
              This permanently deletes "{recordingToDelete?.title}" and its local audio file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordingToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!recordingToDelete) {
                  return;
                }

                void deleteRecording.mutateAsync(recordingToDelete.id).then(
                  () => {
                    setRecordingToDelete(null);
                    toast.success('Recording deleted');
                  },
                  (error: unknown) => {
                    toast.error(error instanceof Error ? error.message : 'Failed to delete recording');
                  },
                );
              }}
              disabled={deleteRecording.isPending}
            >
              {deleteRecording.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
