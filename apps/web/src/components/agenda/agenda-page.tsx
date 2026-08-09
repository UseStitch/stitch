import {
  ActivityIcon,
  CheckCircleIcon,
  CircleAlertIcon,
  InboxIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { AgendaItem, AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

import { AgendaItemDetailSheet } from '@/components/agenda/agenda-item-detail';
import { PRIORITY_LABELS, PRIORITY_VARIANTS, STATUS_LABELS, STATUS_VARIANTS } from '@/components/agenda/constants';
import { formatDateInTz, useUserTimezone } from '@/components/agenda/utils';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { Page, PageContent, PageDescription, PageHeader, PageHeaderContent, PageIcon } from '@/components/ui/page';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table } from '@/components/ui/table';
import {
  agendaItemsQueryOptions,
  agendaListsQueryOptions,
  useCreateAgendaItem,
  useDeleteAgendaItem,
  useDeleteAgendaList,
  useUpdateAgendaItem,
  useUpdateAgendaList,
} from '@/lib/queries/agenda';
type FilterStatus = AgendaItemStatus | 'all';
type FilterPriority = AgendaItemPriority | 'all';

export function AgendaPage({ listId }: { listId?: string }) {
  const navigate = useNavigate();
  const timeZone = useUserTimezone();
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [filterStatus, setFilterStatus] = React.useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = React.useState<FilterPriority>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [sheetItem, setSheetItem] = React.useState<AgendaItem | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [deleteListOpen, setDeleteListOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');

  const { data: listsData } = useQuery(agendaListsQueryOptions());
  const lists = listsData?.lists ?? [];

  const currentList = listId ? lists.find((l) => l.id === listId) : null;

  const { data: itemsData, isLoading } = useQuery(
    agendaItemsQueryOptions({
      page,
      pageSize,
      listId,
      status: filterStatus === 'all' ? undefined : filterStatus,
      priority: filterPriority === 'all' ? undefined : filterPriority,
    }),
  );

  const all = itemsData?.items ?? [];
  const active = all.filter((i) => i.status !== 'done' && i.status !== 'cancelled');
  const completed = all.filter((i) => i.status === 'done' || i.status === 'cancelled');
  const items = [...active, ...completed];
  const totalPages = itemsData?.totalPages ?? 0;
  const total = itemsData?.total ?? 0;

  // Adjust paging/selection during render when the filters or the loaded page change
  const viewKey = `${listId ?? ''}|${filterStatus}|${filterPriority}`;
  const resultKey = `${viewKey}|${itemsData?.page ?? 0}|${itemsData?.total ?? 0}`;
  const [prevViewKey, setPrevViewKey] = React.useState(viewKey);
  const [prevResultKey, setPrevResultKey] = React.useState(resultKey);
  if (prevViewKey !== viewKey) {
    setPrevViewKey(viewKey);
    setPage(1);
  }
  if (prevResultKey !== resultKey) {
    setPrevResultKey(resultKey);
    setSelectedIds(new Set());
  }

  const createMutation = useCreateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();
  const updateMutation = useUpdateAgendaItem();
  const deleteListMutation = useDeleteAgendaList();
  const updateListMutation = useUpdateAgendaList();

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [editTitleValue, setEditTitleValue] = React.useState('');
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function openItem(item: AgendaItem) {
    setSheetItem(item);
    setSheetOpen(true);
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    void Promise.allSettled(ids.map((id) => deleteMutation.mutateAsync(id))).then(() => {
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    });
  }

  function handleBulkMarkDone() {
    const ids = Array.from(selectedIds);
    void Promise.allSettled(ids.map((id) => updateMutation.mutateAsync({ id, updates: { status: 'done' } }))).then(
      () => {
        setSelectedIds(new Set());
      },
    );
  }

  function handleDateChange(itemId: string, dueAt: number | null) {
    updateMutation.mutate({ id: itemId, updates: { dueAt } });
  }

  function handleCreate() {
    if (!newTitle.trim()) return;
    createMutation.mutate(
      { title: newTitle.trim(), listId },
      {
        onSuccess: () => {
          setNewTitle('');
          setCreateOpen(false);
        },
      },
    );
  }

  function handleDeleteList() {
    if (!listId) return;
    deleteListMutation.mutate(listId, {
      onSuccess: () => {
        setDeleteListOpen(false);
        void navigate({ to: '/agenda' });
      },
    });
  }

  function startRenaming() {
    if (!currentList) return;
    setEditTitleValue(currentList.name);
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.select());
  }

  function commitRename() {
    setEditingTitle(false);
    if (!currentList) return;
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== currentList.name) {
      updateListMutation.mutate({ id: currentList.id, updates: { name: trimmed } });
    }
  }

  const currentPage = (itemsData?.page ?? page) - 1;
  let pageNumbers: number[];
  if (totalPages <= 1) {
    pageNumbers = [];
  } else {
    const firstPage = 0;
    const lastPage = totalPages - 1;
    const start = Math.max(firstPage, currentPage - 1);
    const end = Math.min(lastPage, currentPage + 1);
    const pages = new Set<number>([firstPage, lastPage]);
    for (let index = start; index <= end; index += 1) {
      pages.add(index);
    }
    pageNumbers = [...pages].toSorted((a, b) => a - b);
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const totalOpen = lists.reduce((sum, l) => sum + l.itemCounts.open, 0);
  const totalInProgress = lists.reduce((sum, l) => sum + l.itemCounts.in_progress, 0);
  const totalOverdue = lists.reduce((sum, l) => sum + l.itemCounts.overdue, 0);

  return (
    <Page>
      <PageContent>
        <PageHeader className="mb-space-none">
          <PageHeaderContent>
            <PageIcon>
              <Icon as={ListTodoIcon} size="l" />
            </PageIcon>
            <div>
              {editingTitle ? (
                <Input
                  ref={titleInputRef}
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  className="-ml-space-xs h-auto w-full rounded-sm border-none bg-transparent px-space-xs py-space-none text-xl font-semibold ring-1 ring-primary focus-visible:ring-1 focus-visible:ring-primary"
                />
              ) : currentList ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="inline"
                  className="group/title -ml-space-xs gap-space-s"
                  onClick={startRenaming}>
                  <Text as="h1" variant="heading-m">
                    {currentList.name}
                  </Text>
                  <span className="opacity-0 transition-opacity group-hover/title:opacity-100">
                    <Icon as={PencilIcon} size="s" tone="muted" />
                  </span>
                </Button>
              ) : (
                <Text as="h1" variant="heading-m">
                  Agenda
                </Text>
              )}
              <PageDescription>{isLoading ? 'Loading...' : `${total} item${total === 1 ? '' : 's'}`}</PageDescription>
            </div>
          </PageHeaderContent>
          <Stack direction="row" align="center" gap="m">
            {currentList && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteListOpen(true)}>
                <Icon as={Trash2Icon} size="s" />
                Delete List
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Icon as={PlusIcon} size="m" />
              New Item
            </Button>
          </Stack>
        </PageHeader>

        {/* Summary cards */}
        {!listId && (
          <Stack direction="row" gap="l">
            <MetricCard className="flex-1" size="compact" label="Open" value={totalOpen} icon={<InboxIcon />} />
            <MetricCard
              className="flex-1"
              size="compact"
              label="In Progress"
              value={totalInProgress}
              icon={<ActivityIcon />}
            />
            <MetricCard
              className="flex-1"
              size="compact"
              label="Overdue"
              value={totalOverdue}
              icon={<CircleAlertIcon />}
              emphasis="destructive"
            />
          </Stack>
        )}

        {/* Toolbar */}
        <Stack direction="row" wrap align="center" gap="m">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="w-40 bg-background">
              <Text as="span" variant="body" truncate>
                <Text as="span" variant="body" tone="muted">
                  Status:{' '}
                </Text>
                {filterStatus === 'all' ? 'All' : STATUS_LABELS[filterStatus]}
              </Text>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {AGENDA_ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as FilterPriority)}>
            <SelectTrigger className="w-40 bg-background">
              <Text as="span" variant="body" truncate>
                <Text as="span" variant="body" tone="muted">
                  Priority:{' '}
                </Text>
                {filterPriority === 'all' ? 'All' : PRIORITY_LABELS[filterPriority]}
              </Text>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {AGENDA_ITEM_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-space-m">
              <Button variant="outline" size="sm" onClick={handleBulkMarkDone} disabled={updateMutation.isPending}>
                <CheckCircleIcon />
                Mark Done {selectedIds.size}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2Icon />
                Delete {selectedIds.size}
              </Button>
            </div>
          )}
        </Stack>

        {/* Table */}
        <Table.Container>
          <Table.Scroller>
            <Table.Root className="min-w-175 table-fixed">
              <Table.Header>
                <Table.Row className="hover:bg-transparent">
                  <Table.Head className="w-10 text-center">
                    <Checkbox
                      checked={allSelected}
                      data-indeterminate={someSelected || undefined}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </Table.Head>
                  <Table.Head className="w-full min-w-0">Title</Table.Head>
                  <Table.Head className="w-24 text-center">Status</Table.Head>
                  <Table.Head className="w-20 text-center">Priority</Table.Head>
                  {!listId && <Table.Head className="w-24 text-center">List</Table.Head>}
                  <Table.Head className="w-24 text-right">Due</Table.Head>
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
                      ...(!listId ? [{ className: 'w-24' }] : []),
                      { className: 'w-24', skeletonClassName: 'ml-auto h-4 w-16' },
                    ]}
                  />
                ) : items.length === 0 ? (
                  <Table.EmptyRow colSpan={listId ? 5 : 6}>
                    <Empty>
                      <EmptyMedia variant="icon">
                        <Icon as={ListTodoIcon} size="m" />
                      </EmptyMedia>
                      <EmptyTitle>No agenda items</EmptyTitle>
                      <EmptyDescription>Create items from chat or click "New Item" to get started.</EmptyDescription>
                    </Empty>
                  </Table.EmptyRow>
                ) : (
                  <>
                    {items.map((item) => (
                      <AgendaItemRow
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        showListColumn={!listId}
                        timeZone={timeZone}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onClick={() => openItem(item)}
                        onDateChange={handleDateChange}
                      />
                    ))}
                  </>
                )}
              </Table.Body>
            </Table.Root>
          </Table.Scroller>

          {totalPages > 1 ? (
            <div className="border-t border-border px-space-l py-space-l">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) setPage((c) => c - 1);
                      }}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>
                  {pageNumbers.map((pageNumber, index) => {
                    const previousPage = pageNumbers[index - 1];
                    const showGap = pageNumber - previousPage > 1;
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
                              setPage(pageNumber + 1);
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
                        if (page < totalPages) setPage((c) => c + 1);
                      }}
                      className={page >= totalPages ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </Table.Container>
      </PageContent>

      {/* Detail sheet */}
      <AgendaItemDetailSheet
        key={sheetItem ? `${sheetItem.id}:${sheetItem.updatedAt}` : 'none'}
        item={sheetItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Agenda Item</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="What needs to be done?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`}
        description="These items will be permanently removed."
        onConfirm={handleBulkDelete}
        isPending={deleteMutation.isPending}
      />

      {/* Delete list confirmation */}
      <ConfirmDialog
        open={deleteListOpen}
        onOpenChange={setDeleteListOpen}
        title={`Delete list "${currentList?.name}"?`}
        description={`This will permanently delete the list and all ${total} item${total === 1 ? '' : 's'} in it.`}
        onConfirm={handleDeleteList}
        confirmLabel="Delete List"
        isPending={deleteListMutation.isPending}
      />
    </Page>
  );
}

type AgendaItemRowProps = {
  item: AgendaItem;
  selected: boolean;
  showListColumn: boolean;
  timeZone: string;
  onToggleSelect: () => void;
  onClick: () => void;
  onDateChange: (itemId: string, dueAt: number | null) => void;
};

function AgendaItemRow({
  item,
  selected,
  showListColumn,
  timeZone,
  onToggleSelect,
  onClick,
  onDateChange,
}: AgendaItemRowProps) {
  const [dateOpen, setDateOpen] = React.useState(false);
  const [nowMs] = React.useState(() => Date.now());
  const isDone = item.status === 'done' || item.status === 'cancelled';
  const isOverdue = item.dueAt && item.dueAt < nowMs && item.status !== 'done' && item.status !== 'cancelled';

  return (
    <Table.Row className={`cursor-pointer ${isDone ? 'opacity-50' : ''}`} onClick={onClick}>
      <Table.Cell
        className="w-10 text-center"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}>
        <Checkbox checked={selected || isDone} onCheckedChange={onToggleSelect} aria-label="Select item" />
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

      <Table.Cell className="w-24 text-right" onClick={(e) => e.stopPropagation()}>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger
            className={`inline-flex cursor-pointer rounded-sm px-space-xs py-space-2xs text-xs transition-colors hover:bg-muted ${isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
            {item.dueAt ? formatDateInTz(item.dueAt, timeZone) : '—'}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-space-none">
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
    </Table.Row>
  );
}
