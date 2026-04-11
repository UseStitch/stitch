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

import { Badge } from '@/components/ui/badge';
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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
          <Link
            to="/automations/$automationId"
            params={{ automationId: row.original.id }}
            className="truncate font-medium text-foreground hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      }),
      columnHelper.display({
        id: 'model',
        header: 'Model',
        cell: ({ row }) => {
          const automation = row.original;
          const label =
            modelLabelByKey.get(`${automation.providerId}:${automation.modelId}`) ??
            automation.modelId;
          return (
            <Badge variant="secondary" className="text-[11px]">
              {label}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('runCount', {
        header: 'Runs',
        cell: ({ getValue }) => <span className="text-sm tabular-nums">{getValue()}</span>,
      }),
      columnHelper.display({
        id: 'schedule',
        header: 'Schedule',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {getAutomationScheduleLabel(row.original.schedule)}
          </span>
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
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRun(row.original)}
              disabled={runPending}
              aria-label={`Run ${row.original.title}`}
            >
              <PlayIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(row.original.id)}
              aria-label={`Edit ${row.original.title}`}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(row.original)}
              disabled={deletePending}
              aria-label={`Delete ${row.original.title}`}
            >
              <Trash2Icon className="size-3.5 text-destructive" />
            </Button>
          </div>
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
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-225 text-left text-sm">
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <Empty>
                    <EmptyMedia>
                      <BotIcon className="size-10 text-muted-foreground/30" />
                    </EmptyMedia>
                    <EmptyTitle>No automations yet</EmptyTitle>
                    <EmptyDescription>
                      Create your first automation to speed up recurring workflows.
                    </EmptyDescription>
                  </Empty>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group transition-colors hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
                        }}
                      >
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
    </div>
  );
}
