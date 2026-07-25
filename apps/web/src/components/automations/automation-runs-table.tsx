import { ArrowUpRightIcon } from 'lucide-react';
import * as React from 'react';

import {
  type CellContext,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Session } from '@stitch/shared/chat/messages';

import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

type AutomationRunsTableProps = { sessions: Session[]; onOpen: (sessionId: string) => void };

const columnHelper = createColumnHelper<Session>();

type AutomationRunsTableMeta = { onOpen: (sessionId: string) => void };

function TitleCell({ row }: CellContext<Session, Session['title']>) {
  return <Table.Title>{row.original.title ?? 'Untitled run'}</Table.Title>;
}

function TimeCell({ getValue }: CellContext<Session, number>) {
  return <Table.Time value={getValue()} />;
}

function ActionsCell({ row, table }: CellContext<Session, unknown>) {
  const { onOpen } = table.options.meta as AutomationRunsTableMeta;

  return (
    <Table.Actions>
      <Button variant="outline" size="sm" onClick={() => onOpen(row.original.id)}>
        <ArrowUpRightIcon data-icon="inline-start" className="size-4" />
        View
      </Button>
    </Table.Actions>
  );
}

const columns = [
  columnHelper.accessor('title', { header: 'Run', cell: TitleCell }),
  columnHelper.accessor('createdAt', { header: 'Started', cell: TimeCell }),
  columnHelper.accessor('updatedAt', { header: 'Updated', cell: TimeCell }),
  columnHelper.display({ id: 'actions', header: '', cell: ActionsCell }),
];

export function AutomationRunsTable({ sessions, onOpen }: AutomationRunsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const table = useReactTable({
    data: sessions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    meta: { onOpen } satisfies AutomationRunsTableMeta,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table.Container>
      <Table.Scroller>
        <Table.Root className="min-w-180">
          <Table.Header>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Row key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <Table.Head key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </Table.Head>
                ))}
              </Table.Row>
            ))}
          </Table.Header>
          <Table.Body>
            {table.getRowModel().rows.map((row) => (
              <Table.Row key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.Scroller>
    </Table.Container>
  );
}
