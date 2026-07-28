import { Trash2Icon, MicIcon } from 'lucide-react';
import * as React from 'react';

import {
  type CellContext,
  createColumnHelper,
  createSortedRowModel,
  metaHelper,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import type { Recording } from '@stitch/shared/recordings/types';

import { formatClockDuration, getRecordingDisplayTitle, STATUS_LABELS, STATUS_VARIANTS } from '../shared/formatting';
import { LiveDuration } from '../shared/live-duration';
import { PlatformBadge } from '../shared/platform-badge';

import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table } from '@/components/ui/table';

type RecordingsTableMeta = { activeRecordingId: string | null; onDelete: (recording: Recording) => void };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  tableMeta: metaHelper<RecordingsTableMeta>(),
});

const columnHelper = createColumnHelper<typeof features, Recording>();

function TitleCell({ row }: CellContext<typeof features, Recording, string>) {
  return (
    <div className="flex min-w-0 flex-col">
      <Table.Title>{getRecordingDisplayTitle(row.original)}</Table.Title>
    </div>
  );
}

function PlatformCell({ getValue }: CellContext<typeof features, Recording, Recording['platform']>) {
  return <PlatformBadge platform={getValue()} />;
}

function StatusCell({ getValue }: CellContext<typeof features, Recording, Recording['status']>) {
  return <Table.Badge variant={STATUS_VARIANTS[getValue()]}>{STATUS_LABELS[getValue()]}</Table.Badge>;
}

function StartedAtCell({ getValue }: CellContext<typeof features, Recording, Recording['startedAt']>) {
  return <Table.Time value={getValue()} />;
}

function DurationCell({ row, table }: CellContext<typeof features, Recording, unknown>) {
  const { activeRecordingId } = table.options.meta as RecordingsTableMeta;
  const recording = row.original;
  if (recording.id === activeRecordingId) {
    return <LiveDuration startedAt={recording.startedAt} />;
  }
  return <Table.Duration>{formatClockDuration(recording.durationMs)}</Table.Duration>;
}

function CostCell({ getValue }: CellContext<typeof features, Recording, Recording['costUsd']>) {
  return <Table.Money value={getValue()} />;
}

function ActionsHeader() {
  return <div className="pr-space-xs text-right">Actions</div>;
}

function ActionsCell({ row, table }: CellContext<typeof features, Recording, unknown>) {
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
}

const columns = columnHelper.columns([
  columnHelper.accessor('title', { header: 'Title', cell: TitleCell }),
  columnHelper.accessor('platform', { header: 'Platform', cell: PlatformCell }),
  columnHelper.accessor('status', { header: 'Capturing', cell: StatusCell }),
  columnHelper.accessor('startedAt', { header: 'Date', cell: StartedAtCell }),
  columnHelper.display({ id: 'duration', header: 'Duration', cell: DurationCell }),
  columnHelper.accessor('costUsd', { header: 'Cost', cell: CostCell }),
  columnHelper.display({ id: 'actions', header: ActionsHeader, cell: ActionsCell }),
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
  const table = useTable({
    features,
    data: recordings,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange,
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
                {row.getAllCells().map((cell) => (
                  <Table.Cell
                    key={cell.id}
                    className={
                      cell.column.id === 'title'
                        ? 'w-full max-w-xs min-w-48 px-space-xl py-space-l'
                        : 'px-space-xl py-space-l whitespace-nowrap'
                    }>
                    <table.FlexRender cell={cell} />
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
