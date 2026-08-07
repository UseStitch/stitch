import {
  createSortedRowModel,
  createTableHook,
  createTableHookContexts,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';

import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';

// --- Shared features ---

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

// --- Scoped contexts (created before cell components so they can call useCellContext) ---

const { tableContext, cellContext, headerContext, useCellContext } =
  createTableHookContexts<typeof features>();

// --- Cell Components ---
// These use useCellContext() internally via the createTableHook pattern.
// When used in column defs: cell: ({ cell }) => <cell.TitleCell />

function TitleCell() {
  const cell = useCellContext();
  return <Table.Title>{cell.getValue() as string}</Table.Title>;
}

function TextCell() {
  const cell = useCellContext();
  return <Table.Text>{cell.getValue() as string}</Table.Text>;
}

function BadgeCell() {
  const cell = useCellContext();
  return <Table.Badge>{cell.getValue() as string}</Table.Badge>;
}

function TimeCell() {
  const cell = useCellContext();
  return <Table.Time value={cell.getValue() as number | string | Date} />;
}

function DateTimeCell() {
  const cell = useCellContext();
  return <Table.Time value={cell.getValue() as number | string | Date} format="dateTime" />;
}

function ShortDateCell() {
  const cell = useCellContext();
  return <Table.Time value={cell.getValue() as number | string | Date} format="shortDate" />;
}

function NumberCell() {
  const cell = useCellContext();
  return <Table.Number value={cell.getValue() as number} />;
}

function MoneyCell() {
  const cell = useCellContext();
  return <Table.Money value={cell.getValue() as number | null} />;
}

function DurationCell() {
  const cell = useCellContext();
  return <Table.Duration>{cell.getValue() as string}</Table.Duration>;
}

function StatusCell() {
  const cell = useCellContext();
  return <Table.Status>{cell.getValue() as string}</Table.Status>;
}

function SkeletonCell() {
  return <Skeleton className="h-4 w-24" />;
}

// --- createTableHook ---

export const {
  useAppTable,
  createAppColumnHelper,
  
  
  
} = createTableHook({
  features,
  tableContext,
  cellContext,
  headerContext,
  cellComponents: {
    TitleCell,
    TextCell,
    BadgeCell,
    TimeCell,
    DateTimeCell,
    ShortDateCell,
    NumberCell,
    MoneyCell,
    DurationCell,
    StatusCell,
    SkeletonCell,
  },
});

;
