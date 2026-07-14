import {
  ActivityIcon,
  CheckCircleIcon,
  CircleAlertIcon,
  GripVerticalIcon,
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
  useReorderAgendaItems,
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

  const items = React.useMemo(() => {
    const all = itemsData?.items ?? [];
    const active = all.filter((i) => i.status !== 'done' && i.status !== 'cancelled');
    const completed = all.filter((i) => i.status === 'done' || i.status === 'cancelled');
    return [...active, ...completed];
  }, [itemsData?.items]);
  const totalPages = itemsData?.totalPages ?? 0;
  const total = itemsData?.total ?? 0;

  React.useEffect(() => {
    setPage(1);
  }, [filterStatus, filterPriority, listId]);

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [itemsData?.page, itemsData?.total, filterStatus, filterPriority]);

  const createMutation = useCreateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();
  const updateMutation = useUpdateAgendaItem();
  const deleteListMutation = useDeleteAgendaList();
  const reorderMutation = useReorderAgendaItems();
  const updateListMutation = useUpdateAgendaList();

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [editTitleValue, setEditTitleValue] = React.useState('');
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const [dragItemId, setDragItemId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    function clearDrag() {
      setDragItemId(null);
      setDropIndex(null);
    }
    document.addEventListener('dragend', clearDrag);
    return () => document.removeEventListener('dragend', clearDrag);
  }, []);

  function handleRowDragStart(itemId: string) {
    setDragItemId(itemId);
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    if (!e.dataTransfer.types.includes('application/x-agenda-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const targetIdx = e.clientY < midY ? index : index + 1;
    setDropIndex(targetIdx);
  }

  function handleRowDrop(e: React.DragEvent) {
    e.preventDefault();
    const droppedItemId = e.dataTransfer.getData('application/x-agenda-item');
    if (!droppedItemId || dropIndex === null) {
      setDragItemId(null);
      setDropIndex(null);
      return;
    }

    const currentIndex = items.findIndex((i) => i.id === droppedItemId);
    if (currentIndex === -1 || currentIndex === dropIndex || currentIndex + 1 === dropIndex) {
      setDragItemId(null);
      setDropIndex(null);
      return;
    }

    const newOrder = items.map((i) => i.id as string).filter((id) => id !== droppedItemId);
    const insertAt = dropIndex > currentIndex ? dropIndex - 1 : dropIndex;
    newOrder.splice(insertAt, 0, droppedItemId);
    reorderMutation.mutate(newOrder);

    setDragItemId(null);
    setDropIndex(null);
  }

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
  const pageNumbers = React.useMemo(() => {
    if (totalPages <= 1) return [] as number[];
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

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const totalOpen = lists.reduce((sum, l) => sum + l.itemCounts.open, 0);
  const totalInProgress = lists.reduce((sum, l) => sum + l.itemCounts.in_progress, 0);
  const totalOverdue = lists.reduce((sum, l) => sum + l.itemCounts.overdue, 0);

  return (
    <Page>
      <PageContent>
        <PageHeader className="mb-0">
          <PageHeaderContent>
            <PageIcon>
              <ListTodoIcon className="size-5" />
            </PageIcon>
            <div>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  className="-ml-1 w-full rounded border-none bg-transparent px-1 text-xl font-semibold ring-1 ring-primary outline-none"
                />
              ) : currentList ? (
                <button
                  type="button"
                  className="group/title -ml-1 flex items-center gap-1.5 rounded px-1 transition-colors hover:bg-muted"
                  onClick={startRenaming}>
                  <h1 className="text-xl font-semibold">{currentList.name}</h1>
                  <PencilIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
                </button>
              ) : (
                <h1 className="text-xl font-semibold">Agenda</h1>
              )}
              <PageDescription>{isLoading ? 'Loading...' : `${total} item${total === 1 ? '' : 's'}`}</PageDescription>
            </div>
          </PageHeaderContent>
          <div className="flex items-center gap-2">
            {currentList && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteListOpen(true)}>
                <Trash2Icon className="size-3.5" />
                Delete List
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New Item
            </Button>
          </div>
        </PageHeader>

        {/* Summary cards */}
        {!listId && (
          <div className="flex gap-3">
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
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="w-40 bg-background">
              <span className="truncate">
                <span className="text-muted-foreground">Status: </span>
                {filterStatus === 'all' ? 'All' : STATUS_LABELS[filterStatus]}
              </span>
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
              <span className="truncate">
                <span className="text-muted-foreground">Priority: </span>
                {filterPriority === 'all' ? 'All' : PRIORITY_LABELS[filterPriority]}
              </span>
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
            <div className="ml-auto flex items-center gap-2">
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
        </div>

        {/* Table */}
        <Table.Container>
          <Table.Scroller>
            <Table.Root className="min-w-175 table-fixed">
              <Table.Header>
                <Table.Row className="hover:bg-transparent">
                  <Table.Head className="w-8" />
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
              <Table.Body
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('application/x-agenda-item')) return;
                  e.preventDefault();
                }}
                onDrop={handleRowDrop}>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Table.Row key={i} className="hover:bg-transparent">
                      <Table.Cell className="w-8" />
                      <Table.Cell className="w-10" />
                      <Table.Cell className="w-full max-w-0 min-w-0 overflow-hidden">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-24">
                        <div className="mx-auto h-5 w-16 animate-pulse rounded-full bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-20">
                        <div className="mx-auto h-5 w-14 animate-pulse rounded-full bg-muted" />
                      </Table.Cell>
                      {!listId && <Table.Cell className="w-24" />}
                      <Table.Cell className="w-24">
                        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : items.length === 0 ? (
                  <Table.EmptyRow colSpan={listId ? 6 : 7}>
                    <Empty>
                      <EmptyMedia>
                        <ListTodoIcon className="size-10 text-muted-foreground/30" />
                      </EmptyMedia>
                      <EmptyTitle>No agenda items</EmptyTitle>
                      <EmptyDescription>Create items from chat or click "New Item" to get started.</EmptyDescription>
                    </Empty>
                  </Table.EmptyRow>
                ) : (
                  <>
                    {items.map((item, index) => (
                      <React.Fragment key={item.id}>
                        {dropIndex === index && dragItemId && dragItemId !== item.id && (
                          <tr aria-hidden="true">
                            <td colSpan={listId ? 6 : 7} className="p-0">
                              <div className="h-0.5 bg-primary" />
                            </td>
                          </tr>
                        )}
                        <AgendaItemRow
                          item={item}
                          selected={selectedIds.has(item.id)}
                          showListColumn={!listId}
                          isDragging={dragItemId === item.id}
                          timeZone={timeZone}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onClick={() => openItem(item)}
                          onDragStart={() => handleRowDragStart(item.id)}
                          onDragOver={(e) => handleRowDragOver(e, index)}
                          onDateChange={handleDateChange}
                        />
                      </React.Fragment>
                    ))}
                    {dropIndex === items.length && dragItemId && (
                      <tr aria-hidden="true">
                        <td colSpan={listId ? 6 : 7} className="p-0">
                          <div className="h-0.5 bg-primary" />
                        </td>
                      </tr>
                    )}
                  </>
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
                        if (page > 1) setPage((c) => c - 1);
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
      <AgendaItemDetailSheet item={sheetItem} open={sheetOpen} onOpenChange={setSheetOpen} />

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
            autoFocus
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
  isDragging: boolean;
  timeZone: string;
  onToggleSelect: () => void;
  onClick: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDateChange: (itemId: string, dueAt: number | null) => void;
};

function AgendaItemRow({
  item,
  selected,
  showListColumn,
  isDragging,
  timeZone,
  onToggleSelect,
  onClick,
  onDragStart,
  onDragOver,
  onDateChange,
}: AgendaItemRowProps) {
  const [dateOpen, setDateOpen] = React.useState(false);
  const isDone = item.status === 'done' || item.status === 'cancelled';
  const isOverdue = item.dueAt && item.dueAt < Date.now() && item.status !== 'done' && item.status !== 'cancelled';

  function handleDragStart(e: React.DragEvent) {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-agenda-item', item.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart();

    const row = (e.currentTarget as HTMLElement).closest('tr');
    if (row) {
      const clone = row.cloneNode(true) as HTMLElement;
      clone.style.opacity = '0.85';
      const table = document.createElement('table');
      const tbody = document.createElement('tbody');
      tbody.appendChild(clone);
      table.appendChild(tbody);
      table.style.width = `${row.offsetWidth}px`;
      table.style.position = 'absolute';
      table.style.top = '-9999px';
      table.style.left = '-9999px';
      document.body.appendChild(table);
      e.dataTransfer.setDragImage(clone, 20, 20);
      requestAnimationFrame(() => table.remove());
    }
  }

  return (
    <Table.Row
      className={`cursor-pointer ${isDragging ? 'opacity-40' : ''} ${isDone ? 'opacity-50' : ''}`}
      onClick={onClick}
      onDragOver={onDragOver}>
      <Table.Cell className="w-8">
        <div
          draggable
          onDragStart={handleDragStart}
          className="flex w-4 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}>
          <GripVerticalIcon className="size-3.5 text-muted-foreground" />
        </div>
      </Table.Cell>

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
            className={`inline-flex cursor-pointer rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted ${isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
            {item.dueAt ? formatDateInTz(item.dueAt, timeZone) : '—'}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
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
