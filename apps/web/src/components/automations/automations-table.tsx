import { PlayIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Link } from '@tanstack/react-router';

import type { Automation } from '@stitch/shared/automations/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAutomationScheduleLabel } from '@/lib/automations/schedule-label';
import type { ProviderModels } from '@/lib/queries/providers';

type AutomationsTableProps = {
  automations: Automation[];
  providerModels: ProviderModels[];
  runPending: boolean;
  deletePending: boolean;
  onRun: (automation: Automation) => void;
  onEdit: (automationId: string) => void;
  onDelete: (automation: Automation) => void;
};

const columnHelper = createColumnHelper<Automation>();

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function AutomationsTable({
  automations,
  providerModels,
  runPending,
  deletePending,
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
            modelLabelByKey.get(`${automation.providerId}:${automation.modelId}`) ?? automation.modelId;
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
          <span className="text-sm text-muted-foreground">{getAutomationScheduleLabel(row.original.schedule)}</span>
        ),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Updated',
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{formatDate(getValue())}</span>,
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

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/80">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="border-b border-border/60 bg-muted/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 last:border-b-0">
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
