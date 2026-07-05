import { PlayIcon, PencilIcon, Trash2Icon, BotIcon } from 'lucide-react';
import * as React from 'react';

import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import type { Automation } from '@stitch/shared/automations/types';

import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Table } from '@/components/ui/table';
import { getAutomationScheduleLabel } from '@/lib/automations/schedule-label';
import type { ProviderModels } from '@/lib/queries/providers';

type AutomationsTableProps = {
  automations: Automation[];
  providerModels: ProviderModels[];
  page: number;
  totalPages: number;
  runPending: boolean;
  deletePending: boolean;
  onPageChange: (page: number) => void;
  onRun: (automation: Automation) => void;
  onEdit: (automationId: string) => void;
  onDelete: (automation: Automation) => void;
};

const columnHelper = createColumnHelper<Automation>();

export function AutomationsTable({
  automations,
  providerModels,
  page,
  totalPages,
  runPending,
  deletePending,
  onPageChange,
  onRun,
  onEdit,
  onDelete,
}: AutomationsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const modelLabelByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providerModels) {
      for (const model of provider.models) {
        map.set(`${provider.providerId}:${model.id}`, `${provider.providerName} / ${model.name}`);
      }
    }
    return map;
  }, [providerModels]);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: ({ row }) => (
          <Table.Title className="block">
            <Link
              to="/automations/$automationId"
              params={{ automationId: row.original.id }}
              className="text-foreground hover:underline">
              {row.original.title}
            </Link>
          </Table.Title>
        ),
      }),
      columnHelper.display({
        id: 'model',
        header: 'Model',
        cell: ({ row }) => {
          const automation = row.original;
          const label = modelLabelByKey.get(`${automation.providerId}:${automation.modelId}`) ?? automation.modelId;
          return <Table.Badge>{label}</Table.Badge>;
        },
      }),
      columnHelper.accessor('runCount', {
        header: 'Runs',
        cell: ({ getValue }) => <Table.Number value={getValue()} />,
      }),
      columnHelper.display({
        id: 'schedule',
        header: 'Schedule',
        cell: ({ row }) => <Table.Text>{getAutomationScheduleLabel(row.original.schedule)}</Table.Text>,
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Updated',
        cell: ({ getValue }) => <Table.Time value={getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Table.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRun(row.original)}
              disabled={runPending}
              aria-label={`Run ${row.original.title}`}>
              <PlayIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(row.original.id)}
              aria-label={`Edit ${row.original.title}`}>
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(row.original)}
              disabled={deletePending}
              aria-label={`Delete ${row.original.title}`}>
              <Trash2Icon className="size-3.5 text-destructive" />
            </Button>
          </Table.Actions>
        ),
      }),
    ],
    [deletePending, modelLabelByKey, onDelete, onEdit, onRun, runPending],
  );

  const table = useReactTable({
    data: automations,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const currentPage = page - 1;
  const pageNumbers = React.useMemo(() => {
    if (totalPages <= 1) {
      return [] as number[];
    }

    const firstPage = 0;
    const lastPage = totalPages - 1;
    const start = Math.max(firstPage, currentPage - 1);
    const end = Math.min(lastPage, currentPage + 1);

    const pages = new Set<number>([firstPage, lastPage]);
    for (let index = start; index <= end; index += 1) {
      pages.add(index);
    }

    return [...pages].sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  return (
    <Table.Container>
      <Table.Scroller>
        <Table.Root className="min-w-225">
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
            {table.getRowModel().rows.length === 0 ? (
              <Table.EmptyRow colSpan={columns.length}>
                <Empty>
                  <EmptyMedia>
                    <BotIcon className="size-10 text-muted-foreground/30" />
                  </EmptyMedia>
                  <EmptyTitle>No automations yet</EmptyTitle>
                  <EmptyDescription>Create your first automation to speed up recurring workflows.</EmptyDescription>
                </Empty>
              </Table.EmptyRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Table.Row key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                  ))}
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Table.Scroller>

      {totalPages > 1 ? (
        <div className="border-t border-border px-3 py-3">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (page > 1) {
                      onPageChange(page - 1);
                    }
                  }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                />
              </PaginationItem>

              {pageNumbers.map((pageNumber, index) => {
                const previousPage = pageNumbers[index - 1];
                const showGap = previousPage !== undefined && pageNumber - previousPage > 1;
                return (
                  <React.Fragment key={`page-${pageNumber}`}>
                    {showGap ? (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : null}
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        isActive={pageNumber === currentPage}
                        onClick={(event) => {
                          event.preventDefault();
                          onPageChange(pageNumber + 1);
                        }}>
                        {pageNumber + 1}
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
                    if (page < totalPages) {
                      onPageChange(page + 1);
                    }
                  }}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </Table.Container>
  );
}
