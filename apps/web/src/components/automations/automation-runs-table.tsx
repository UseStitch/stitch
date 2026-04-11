import { ArrowUpRightIcon } from 'lucide-react';
import * as React from 'react';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Session } from '@stitch/shared/chat/messages';

import { Button } from '@/components/ui/button';

type AutomationRunsTableProps = {
  sessions: Session[];
  onOpen: (sessionId: string) => void;
};

const columnHelper = createColumnHelper<Session>();

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AutomationRunsTable({ sessions, onOpen }: AutomationRunsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Run',
        cell: ({ row }) => (
          <span className="truncate font-medium">{row.original.title ?? 'Untitled run'}</span>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Started',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{formatDate(getValue())}</span>
        ),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Updated',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{formatDate(getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpen(row.original.id)}>
              <ArrowUpRightIcon data-icon="inline-start" className="size-4" />
              View
            </Button>
          </div>
        ),
      }),
    ],
    [onOpen],
  );

  const table = useReactTable({
    data: sessions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground"
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="group transition-colors hover:bg-muted/40">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
