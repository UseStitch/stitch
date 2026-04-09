import { CopyIcon, MicIcon, RotateCcwIcon, SquareIcon, VideoIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Recording, RecordingPlatform } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
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

function PlatformBadge({ platform }: { platform: RecordingPlatform }) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.manual;

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
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
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
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

function RecordingPreview({ src }: { src: string | null }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    if (!src) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const audio = new Audio(src);
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handlePlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [src]);

  const progressValue = duration > 0 ? (currentTime / duration) * 100 : 0;

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
    <div className="min-w-56 space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="outline" onClick={start} disabled={isPlaying}>
          Start
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={stop} disabled={!isPlaying}>
          Stop
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={reset}
          disabled={currentTime === 0 && !isPlaying}
        >
          <RotateCcwIcon className="size-4" />
          Reset
        </Button>
      </div>
      <Progress value={progressValue} aria-label="Preview playback progress" />
    </div>
  );
}

export function RecordingsPage() {
  const { data } = useSuspenseQuery(recordingsQueryOptions);
  const startRecording = useStartRecording();
  const stopRecording = useStopRecording();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'startedAt', desc: true }]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [title, setTitle] = React.useState('');
  const [tick, setTick] = React.useState(Date.now());
  const [baseUrl, setBaseUrl] = React.useState<string | null>(null);

  useQuery({
    ...recordingsQueryOptions,
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

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      }),
      columnHelper.accessor('platform', {
        header: 'Platform',
        cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.accessor('startedAt', {
        header: 'Date',
        cell: ({ getValue }) => <span className="text-muted-foreground">{formatDate(getValue())}</span>,
      }),
      columnHelper.display({
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => {
          const recording = row.original;
          if (recording.id === data.activeRecordingId) {
            return <span className="text-muted-foreground">{formatDuration(activeDuration)}</span>;
          }
          return <span className="text-muted-foreground">{formatDuration(recording.durationMs)}</span>;
        },
      }),
      columnHelper.display({
        id: 'preview',
        header: 'Preview',
        cell: ({ row }) => (
          <RecordingPreview
            src={
              baseUrl && row.original.status === 'completed'
                ? `${baseUrl}/recordings/${row.original.id}/audio`
                : null
            }
          />
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(row.original.filePath).then(
                () => toast.success('File path copied'),
                () => toast.error('Failed to copy file path'),
              );
            }}
          >
            <CopyIcon className="size-4" />
            Copy path
          </Button>
        ),
      }),
    ],
    [activeDuration, baseUrl, data.activeRecordingId],
  );

  const table = useReactTable({
    data: data.recordings,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/70">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-3 py-2">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                      No recordings yet.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60 align-top">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-3">
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
            <div className="border-t border-border/60 px-3 py-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (table.getCanPreviousPage()) {
                          table.previousPage();
                        }
                      }}
                      className={!table.getCanPreviousPage() ? 'pointer-events-none opacity-50' : undefined}
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
                              table.setPageIndex(page);
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
                        if (table.getCanNextPage()) {
                          table.nextPage();
                        }
                      }}
                      className={!table.getCanNextPage() ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
