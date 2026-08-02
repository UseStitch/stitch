import { ArrowUpRightIcon } from 'lucide-react';
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

import type { Session } from '@stitch/shared/chat/messages';

import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

type AutomationRunsTableProps = { sessions: Session[]; onOpen: (sessionId: string) => void };

type AutomationRunsTableMeta = { onOpen: (sessionId: string) => void };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  tableMeta: metaHelper<AutomationRunsTableMeta>(),
});

const columnHelper = createColumnHelper<typeof features, Session>();

function TitleCell({ row }: CellContext<typeof features, Session, Session['title']>) {
  return <Table.Title>{row.original.title ?? 'Untitled run'}</Table.Title>;
}

function TimeCell({ getValue }: CellContext<typeof features, Session, number>) {
  return <Table.Time value={getValue()} />;
}

function ActionsCell({ row, table }: CellContext<typeof features, Session, unknown>) {
  const { onOpen } = table.options.meta as AutomationRunsTableMeta;

  return (
    <Table.Actions>
      <Button variant="outline" size="sm" onClick={() => onOpen(row.original.id)}>
        <Icon as={ArrowUpRightIcon} size="m" data-icon="inline-start" />
        View
      </Button>
    </Table.Actions>
  );
}

const columns = columnHelper.columns([
  columnHelper.accessor('title', { header: 'Run', cell: TitleCell }),
  columnHelper.accessor('createdAt', { header: 'Started', cell: TimeCell }),
  columnHelper.accessor('updatedAt', { header: 'Updated', cell: TimeCell }),
  columnHelper.display({ id: 'actions', header: '', cell: ActionsCell }),
]);

export function AutomationRunsTable({ sessions, onOpen }: AutomationRunsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const table = useTable({
    features,
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
                {row.getAllCells().map((cell) => (
                  <Table.Cell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.Scroller>
    </Table.Container>
  );
}
