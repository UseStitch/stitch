import * as React from 'react';

import { Badge, type badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type TableContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  bordered?: boolean;
};

type TableTimeFormat = 'date' | 'dateTime' | 'shortDate' | 'time';

function formatTableTime(value: number | string | Date, format: TableTimeFormat): string {
  const date = value instanceof Date ? value : new Date(value);

  if (format === 'dateTime') {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (format === 'shortDate') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  if (format === 'time') {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTableMoney(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function TableContainer({ bordered = true, className, ...props }: TableContainerProps) {
  return (
    <div
      className={cn(
        'overflow-hidden bg-background',
        bordered && 'rounded-xl border border-border',
        className,
      )}
      {...props}
    />
  );
}

function TableScroller({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-x-auto', className)} {...props} />;
}

function TableRoot({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-left text-sm', className)} {...props} />;
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border bg-muted/40', className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('group align-middle transition-colors hover:bg-muted/40', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle whitespace-nowrap', className)} {...props} />;
}

function TableEmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}

function TableTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('truncate text-sm font-medium', className)} {...props} />;
}

function TableText({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function TableTime({
  value,
  format = 'date',
  className,
}: {
  value: number | string | Date;
  format?: TableTimeFormat;
  className?: string;
}) {
  return (
    <span className={cn('text-xs text-muted-foreground', className)}>
      {formatTableTime(value, format)}
    </span>
  );
}

function TableDuration({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('text-xs tabular-nums text-muted-foreground', className)} {...props} />
  );
}

function TableNumber({ value, className }: { value: number; className?: string }) {
  return <span className={cn('text-sm tabular-nums', className)}>{value}</span>;
}

function TableMoney({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn('text-xs tabular-nums text-muted-foreground', className)}>
      {formatTableMoney(value)}
    </span>
  );
}

function TableStatus({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('text-xs capitalize text-muted-foreground', className)} {...props} />;
}

function TableBadge({
  className,
  variant = 'secondary',
  ...props
}: React.ComponentProps<typeof Badge> & VariantProps<typeof badgeVariants>) {
  return <Badge variant={variant} className={cn('text-[11px]', className)} {...props} />;
}

function TableIconText({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

function TableActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-1', className)} {...props} />;
}

export const Table = {
  Actions: TableActions,
  Badge: TableBadge,
  Body: TableBody,
  Cell: TableCell,
  Container: TableContainer,
  Duration: TableDuration,
  EmptyRow: TableEmptyRow,
  Head: TableHead,
  Header: TableHeader,
  IconText: TableIconText,
  Money: TableMoney,
  Number: TableNumber,
  Root: TableRoot,
  Row: TableRow,
  Scroller: TableScroller,
  Status: TableStatus,
  Text: TableText,
  Time: TableTime,
  Title: TableTitle,
};
