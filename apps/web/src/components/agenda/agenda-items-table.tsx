import { ListTodoIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import type { AgendaItem } from '@stitch/shared/agenda/types';

import { PRIORITY_LABELS, PRIORITY_VARIANTS, STATUS_LABELS, STATUS_VARIANTS } from '@/components/agenda/constants';
import { formatDateInTz } from '@/components/agenda/utils';
import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NumberedPagination } from '@/components/ui/numbered-pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table } from '@/components/ui/table';

type AgendaItemsTableProps = {
  items: AgendaItem[];
  isLoading: boolean;
  showListColumn: boolean;
  timeZone: string;
  page: number;
  totalPages: number;
  deletingItemId?: string;
  onPageChange: (page: number) => void;
  onToggleDone: (item: AgendaItem) => void;
  onEdit: (item: AgendaItem) => void;
  onDelete: (item: AgendaItem) => void;
  onDateChange: (itemId: string, dueAt: number | null) => void;
};

export function AgendaItemsTable({
  items,
  isLoading,
  showListColumn,
  timeZone,
  page,
  totalPages,
  deletingItemId,
  onPageChange,
  onToggleDone,
  onEdit,
  onDelete,
  onDateChange,
}: AgendaItemsTableProps) {
  return (
    <Table.Container>
      <Table.Scroller>
        <Table.Root className="min-w-175 table-fixed">
          <Table.Header>
            <Table.Row className="hover:bg-transparent">
              <Table.Head className="w-10 text-center" />
              <Table.Head className="w-full min-w-0">Title</Table.Head>
              <Table.Head className="w-24 text-center">Status</Table.Head>
              <Table.Head className="w-20 text-center">Priority</Table.Head>
              {showListColumn && <Table.Head className="w-24 text-center">List</Table.Head>}
              <Table.Head className="w-28">Due</Table.Head>
              <Table.Head className="w-24" />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {isLoading ? (
              <Table.SkeletonRows
                columns={[
                  { className: 'w-10' },
                  { className: 'w-full max-w-0 min-w-0 overflow-hidden', skeletonClassName: 'h-4' },
                  { className: 'w-24', skeletonClassName: 'mx-auto h-5 w-16 rounded-full' },
                  { className: 'w-20', skeletonClassName: 'mx-auto h-5 w-14 rounded-full' },
                  ...(showListColumn ? [{ className: 'w-24' }] : []),
                  { className: 'w-28', skeletonClassName: 'h-4 w-16' },
                  { className: 'w-24', skeletonClassName: 'ml-auto h-7 w-16 rounded-lg' },
                ]}
              />
            ) : items.length === 0 ? (
              <Table.EmptyRow colSpan={showListColumn ? 7 : 6}>
                <Empty>
                  <EmptyMedia variant="icon">
                    <Icon as={ListTodoIcon} size="m" />
                  </EmptyMedia>
                  <EmptyTitle>No agenda items</EmptyTitle>
                  <EmptyDescription>Create items from chat or click "New Item" to get started.</EmptyDescription>
                </Empty>
              </Table.EmptyRow>
            ) : (
              items.map((item) => (
                <AgendaItemRow
                  key={item.id}
                  item={item}
                  showListColumn={showListColumn}
                  timeZone={timeZone}
                  deletePending={deletingItemId === item.id}
                  onToggleDone={() => onToggleDone(item)}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item)}
                  onDateChange={onDateChange}
                />
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Table.Scroller>

      <NumberedPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </Table.Container>
  );
}

type AgendaItemRowProps = {
  item: AgendaItem;
  showListColumn: boolean;
  timeZone: string;
  deletePending: boolean;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDateChange: (itemId: string, dueAt: number | null) => void;
};

function AgendaItemRow({
  item,
  showListColumn,
  timeZone,
  deletePending,
  onToggleDone,
  onEdit,
  onDelete,
  onDateChange,
}: AgendaItemRowProps) {
  const [dateOpen, setDateOpen] = React.useState(false);
  const [nowMs] = React.useState(() => Date.now());
  const isDone = item.status === 'done' || item.status === 'cancelled';
  const isOverdue = item.dueAt && item.dueAt < nowMs && item.status !== 'done' && item.status !== 'cancelled';

  return (
    <Table.Row className={isDone ? 'opacity-50' : undefined}>
      <Table.Cell className="w-10 text-center">
        <Checkbox
          checked={item.status === 'done'}
          onCheckedChange={onToggleDone}
          aria-label={item.status === 'done' ? 'Mark as open' : 'Mark as done'}
        />
      </Table.Cell>

      <Table.Cell className="w-full max-w-0 min-w-0 overflow-hidden">
        <Table.Title className={`block ${isDone ? 'text-muted-foreground line-through' : ''}`}>
          {item.title}
        </Table.Title>
        {item.description && (
          <Table.Text className={`block truncate ${isDone ? 'line-through' : ''}`}>{item.description}</Table.Text>
        )}
      </Table.Cell>

      <Table.Cell className="w-24 text-center">
        <Table.Badge variant={STATUS_VARIANTS[item.status]} size="xs">
          {STATUS_LABELS[item.status]}
        </Table.Badge>
      </Table.Cell>

      <Table.Cell className="w-20 text-center">
        <Table.Badge variant={PRIORITY_VARIANTS[item.priority]} size="xs">
          {PRIORITY_LABELS[item.priority]}
        </Table.Badge>
      </Table.Cell>

      {showListColumn && (
        <Table.Cell className="w-24 text-center text-xs text-muted-foreground">{item.listName ?? '—'}</Table.Cell>
      )}

      <Table.Cell className="w-28">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger
            className={`inline-flex cursor-pointer rounded-sm px-space-xs py-space-2xs text-xs transition-colors hover:bg-muted ${isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
            {item.dueAt ? formatDateInTz(item.dueAt, timeZone) : '—'}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-space-none">
            <Calendar
              mode="single"
              selected={item.dueAt ? new Date(item.dueAt) : undefined}
              onSelect={(date) => {
                if (date) {
                  const y = date.getFullYear();
                  const m = date.getMonth();
                  const d = date.getDate();
                  const noon = new Date(y, m, d, 12, 0, 0);
                  onDateChange(item.id, noon.getTime());
                } else {
                  onDateChange(item.id, null);
                }
                setDateOpen(false);
              }}
              defaultMonth={item.dueAt ? new Date(item.dueAt) : undefined}
            />
          </PopoverContent>
        </Popover>
      </Table.Cell>

      <Table.Cell className="w-24">
        <Table.Actions>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${item.title}`}>
            <Icon as={PencilIcon} size="s" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={deletePending}
            aria-label={`Delete ${item.title}`}>
            <Icon as={Trash2Icon} size="s" tone="destructive" />
          </Button>
        </Table.Actions>
      </Table.Cell>
    </Table.Row>
  );
}
