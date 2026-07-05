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

import { formatClockDuration, getRecordingDisplayTitle, STATUS_LABELS, STATUS_VARIANTS } from '../shared/formatting';
import { LiveDuration } from '../shared/live-duration';
import { PlatformBadge } from '../shared/platform-badge';

import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table } from '@/components/ui/table';

const columnHelper = createColumnHelper<Recording>();

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
            <Table.Title>{getRecordingDisplayTitle(row.original)}</Table.Title>
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
          <Table.Badge variant={STATUS_VARIANTS[getValue()]}>{STATUS_LABELS[getValue()]}</Table.Badge>
        ),
      }),
      columnHelper.accessor('startedAt', { header: 'Date', cell: ({ getValue }) => <Table.Time value={getValue()} /> }),
      columnHelper.display({
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => {
          const recording = row.original;
          if (recording.id === activeRecordingId) {
            return <LiveDuration startedAt={recording.startedAt} />;
          }
          return <Table.Duration>{formatClockDuration(recording.durationMs)}</Table.Duration>;
        },
      }),
      columnHelper.accessor('costUsd', { header: 'Cost', cell: ({ getValue }) => <Table.Money value={getValue()} /> }),
      columnHelper.display({
        id: 'actions',
        header: () => <div className="pr-1 text-right">Actions</div>,
        cell: ({ row }) => (
          <Table.Actions className="-mr-1.5">
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
              className="text-destructive hover:text-destructive">
              <Trash2Icon className="size-4" />
            </Button>
          </Table.Actions>
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
    <Table.Scroller>
      <Table.Root>
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <Table.Head
                  key={header.id}
                  className={
                    header.column.id === 'title'
                      ? 'w-full max-w-xs min-w-48 px-4 py-2 font-medium'
                      : 'px-4 py-2 font-medium whitespace-nowrap'
                  }>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </Table.Head>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.length === 0 ? (
            <Table.EmptyRow colSpan={columns.length}>
              <Empty>
                <EmptyMedia>
                  <MicIcon className="size-10 text-muted-foreground/30" />
                </EmptyMedia>
                <EmptyTitle>No recordings yet</EmptyTitle>
                <EmptyDescription>Start recording to capture your first meeting audio.</EmptyDescription>
              </Empty>
            </Table.EmptyRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <Table.Row key={row.id} className="cursor-pointer" onClick={() => onNavigate(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Cell
                    key={cell.id}
                    className={
                      cell.column.id === 'title' ? 'w-full max-w-xs min-w-48 px-4 py-3' : 'px-4 py-3 whitespace-nowrap'
                    }>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </Table.Scroller>
  );
}
