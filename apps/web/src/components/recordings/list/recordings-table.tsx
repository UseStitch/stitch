import { Trash2Icon, MicIcon } from 'lucide-react';
import * as React from 'react';

import { type SortingState } from '@tanstack/react-table';

import type { Recording } from '@stitch/shared/recordings/types';

import { formatClockDuration, getRecordingDisplayTitle, STATUS_LABELS, STATUS_VARIANTS } from '../shared/formatting';
import { LiveDuration } from '../shared/live-duration';
import { PlatformBadge } from '../shared/platform-badge';

import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table } from '@/components/ui/table';
import { createAppColumnHelper, useAppTable } from '@/hooks/table-hook';

type RecordingsTableMeta = { activeRecordingId: string | null; onDelete: (recording: Recording) => void };

const columnHelper = createAppColumnHelper<Recording>();

const columns = columnHelper.columns([
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
    cell: ({ cell }) => <PlatformBadge platform={cell.getValue()} />,
  }),
  columnHelper.accessor('status', {
    header: 'Capturing',
    cell: ({ cell }) => (
      <Table.Badge variant={STATUS_VARIANTS[cell.getValue()]}>{STATUS_LABELS[cell.getValue()]}</Table.Badge>
    ),
  }),
  columnHelper.accessor('startedAt', { header: 'Date', cell: ({ cell }) => <cell.TimeCell /> }),
  columnHelper.display({
    id: 'duration',
    header: 'Duration',
    cell: ({ row, table }) => {
      const { activeRecordingId } = table.options.meta as RecordingsTableMeta;
      const recording = row.original;
      if (recording.id === activeRecordingId) {
        return <LiveDuration startedAt={recording.startedAt} />;
      }
      return <Table.Duration>{formatClockDuration(recording.durationMs)}</Table.Duration>;
    },
  }),
  columnHelper.accessor('costUsd', { header: 'Cost', cell: ({ cell }) => <cell.MoneyCell /> }),
  columnHelper.display({
    id: 'actions',
    header: () => <div className="pr-space-xs text-right">Actions</div>,
    cell: ({ row, table }) => {
      const { activeRecordingId, onDelete } = table.options.meta as RecordingsTableMeta;
      return (
        <Table.Actions className="-mr-space-s">
          <Button
            type="button"
            variant="destructive-quiet"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original);
            }}
            title="Delete recording"
            aria-label="Delete recording"
            disabled={row.original.id === activeRecordingId}>
            <Icon as={Trash2Icon} size="m" />
          </Button>
        </Table.Actions>
      );
    },
  }),
]);

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
  const table = useAppTable({
    data: recordings,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    meta: { activeRecordingId, onDelete },
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
                      ? 'w-full max-w-xs min-w-48 px-space-xl py-space-m font-medium'
                      : 'px-space-xl py-space-m font-medium whitespace-nowrap'
                  }>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
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
                  <Icon as={MicIcon} size="l" color="var(--text-faint)" />
                </EmptyMedia>
                <EmptyTitle>No recordings yet</EmptyTitle>
                <EmptyDescription>Start recording to capture your first meeting audio.</EmptyDescription>
              </Empty>
            </Table.EmptyRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <Table.Row key={row.id} className="cursor-pointer" onClick={() => onNavigate(row.original.id)}>
                {row.getAllCells().map((c) => (
                  <table.AppCell cell={c} key={c.id}>
                    {(cell) => (
                      <Table.Cell
                        className={
                          cell.column.id === 'title'
                            ? 'w-full max-w-xs min-w-48 px-space-xl py-space-l'
                            : 'px-space-xl py-space-l whitespace-nowrap'
                        }>
                        <cell.FlexRender />
                      </Table.Cell>
                    )}
                  </table.AppCell>
                ))}
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </Table.Scroller>
  );
}
