import { Trash2Icon, MicIcon } from 'lucide-react';
import * as React from 'react';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Recording } from '@stitch/shared/recordings/types';

import {
  formatClockDuration,
  formatRecordingDate,
  getRecordingDisplayTitle,
} from '../shared/formatting';
import { LiveDuration } from '../shared/live-duration';
import { PlatformBadge } from '../shared/platform-badge';
import { RecordingCopyButton } from '../shared/recording-copy-button';

import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

const columnHelper = createColumnHelper<Recording>();

function formatCost(costUsd: number | null): string {
  if (costUsd === null) return '—';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

interface RecordingsTableProps {
  recordings: Recording[];
  activeRecordingId: string | null;
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  onDelete: (recording: Recording) => void;
  onNavigate: (recordingId: string) => void;
}

export function RecordingsTable({
  recordings,
  activeRecordingId,
  sorting,
  onSortingChange,
  onDelete,
  onNavigate,
}: RecordingsTableProps) {
  const columns = React.useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {getRecordingDisplayTitle(row.original)}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor('platform', {
        header: 'Platform',
        cell: ({ getValue }) => <PlatformBadge platform={getValue()} />,
      }),
      columnHelper.accessor('status', {
        header: 'Capturing',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground capitalize">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('startedAt', {
        header: 'Date',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{formatRecordingDate(getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => {
          const recording = row.original;
          if (recording.id === activeRecordingId) {
            return <LiveDuration startedAt={recording.startedAt} />;
          }
          return (
            <span className="text-xs text-muted-foreground">
              {formatClockDuration(recording.durationMs)}
            </span>
          );
        },
      }),
      columnHelper.accessor('costUsd', {
        header: 'Cost',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCost(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <div className="pr-1 text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="-mr-1.5 flex items-center justify-end gap-1">
            <RecordingCopyButton value={row.original.filePath} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.original);
              }}
              title="Delete recording"
              aria-label="Delete recording"
              disabled={row.original.id === activeRecordingId}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [activeRecordingId, onDelete],
  );

  const table = useReactTable({
    data: recordings,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
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
                      : 'px-4 py-2 font-medium whitespace-nowrap'
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
                onClick={() => onNavigate(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={
                      cell.column.id === 'title'
                        ? 'w-full min-w-62.5 px-4 py-3'
                        : 'px-4 py-3 whitespace-nowrap'
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
  );
}
