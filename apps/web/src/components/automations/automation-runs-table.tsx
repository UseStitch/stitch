import { ArrowUpRightIcon } from 'lucide-react';
import * as React from 'react';

import { type SortingState } from '@tanstack/react-table';

import type { Session } from '@stitch/shared/chat/messages';

import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { createAppColumnHelper, useAppTable } from '@/hooks/table-hook';

type AutomationRunsTableProps = { sessions: Session[]; onOpen: (sessionId: string) => void };

type AutomationRunsTableMeta = { onOpen: (sessionId: string) => void };

const columnHelper = createAppColumnHelper<Session>();

const columns = columnHelper.columns([
  columnHelper.accessor('title', {
    header: 'Run',
    cell: ({ row }) => <Table.Title>{row.original.title ?? 'Untitled run'}</Table.Title>,
  }),
  columnHelper.accessor('createdAt', { header: 'Started', cell: ({ cell }) => <cell.TimeCell /> }),
  columnHelper.accessor('updatedAt', { header: 'Updated', cell: ({ cell }) => <cell.TimeCell /> }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: ({ row, table }) => {
      const { onOpen } = table.options.meta as AutomationRunsTableMeta;
      return (
        <Table.Actions>
          <Button variant="outline" size="sm" onClick={() => onOpen(row.original.id)}>
            <Icon as={ArrowUpRightIcon} size="m" data-icon="inline-start" />
            View
          </Button>
        </Table.Actions>
      );
    },
  }),
]);

export function AutomationRunsTable({ sessions, onOpen }: AutomationRunsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const table = useAppTable({
    data: sessions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    meta: { onOpen },
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
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </Table.Head>
                ))}
              </Table.Row>
            ))}
          </Table.Header>
          <Table.Body>
            {table.getRowModel().rows.map((row) => (
              <Table.Row key={row.id}>
                {row.getAllCells().map((c) => (
                  <table.AppCell cell={c} key={c.id}>
                    {(cell) => (
                      <Table.Cell>
                        <cell.FlexRender />
                      </Table.Cell>
                    )}
                  </table.AppCell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.Scroller>
    </Table.Container>
  );
}
