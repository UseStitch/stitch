import { ActivityIcon, CircleAlertIcon, InboxIcon, ListTodoIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';

import type { AgendaItem, AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

import { AgendaItemDetailSheet } from '@/components/agenda/agenda-item-detail';
import { AgendaItemsTable } from '@/components/agenda/agenda-items-table';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/components/agenda/constants';
import { useUserTimezone } from '@/components/agenda/utils';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { Page, PageContent, PageDescription, PageHeader, PageHeaderContent, PageIcon } from '@/components/ui/page';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  agendaItemsQueryOptions,
  agendaListsQueryOptions,
  useCreateAgendaItem,
  useDeleteAgendaItem,
  useDeleteAgendaList,
  useUpdateAgendaItem,
  useUpdateAgendaList,
} from '@/lib/queries/agenda';
export function AgendaPage({ listId }: { listId?: string }) {
  const navigate = useNavigate();
  const timeZone = useUserTimezone();
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sheetItem, setSheetItem] = React.useState<AgendaItem | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<AgendaItem | null>(null);
  const [deleteListOpen, setDeleteListOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');

  const { data: listsData } = useQuery(agendaListsQueryOptions());
  const lists = listsData?.lists ?? [];

  const currentList = listId ? lists.find((l) => l.id === listId) : null;
  const filterStatus = columnFilters.find((filter) => filter.id === 'status')?.value as AgendaItemStatus | undefined;
  const filterPriority = columnFilters.find((filter) => filter.id === 'priority')?.value as
    | AgendaItemPriority
    | undefined;

  const { data: itemsData, isLoading } = useQuery(
    agendaItemsQueryOptions({ page, pageSize, listId, status: filterStatus, priority: filterPriority }),
  );

  const all = itemsData?.items ?? [];
  const active = all.filter((i) => i.status !== 'done' && i.status !== 'cancelled');
  const completed = all.filter((i) => i.status === 'done' || i.status === 'cancelled');
  const items = [...active, ...completed];
  const totalPages = itemsData?.totalPages ?? 0;
  const total = itemsData?.total ?? 0;

  // Adjust paging during render when the selected list changes
  const viewKey = listId ?? '';
  const [prevViewKey, setPrevViewKey] = React.useState(viewKey);
  if (prevViewKey !== viewKey) {
    setPrevViewKey(viewKey);
    setPage(1);
  }

  const createMutation = useCreateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();
  const updateMutation = useUpdateAgendaItem();
  const deleteListMutation = useDeleteAgendaList();
  const updateListMutation = useUpdateAgendaList();

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [editTitleValue, setEditTitleValue] = React.useState('');
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  function handleToggleDone(item: AgendaItem) {
    const nextStatus: AgendaItemStatus = item.status === 'done' ? 'open' : 'done';
    updateMutation.mutate({ id: item.id, updates: { status: nextStatus } });
  }

  function openItem(item: AgendaItem) {
    setSheetItem(item);
    setSheetOpen(true);
  }

  function handleDeleteItem() {
    if (!itemToDelete) return;
    deleteMutation.mutate(itemToDelete.id, {
      onSuccess: () => {
        setItemToDelete(null);
      },
    });
  }

  function handleDateChange(itemId: string, dueAt: number | null) {
    updateMutation.mutate({ id: itemId, updates: { dueAt } });
  }

  function setFilter(id: 'status' | 'priority', value: string | null) {
    setColumnFilters((current) => [
      ...current.filter((filter) => filter.id !== id),
      ...(!value || value === 'all' ? [] : [{ id, value }]),
    ]);
    setPage(1);
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
          <Select value={filterStatus ?? 'all'} onValueChange={(value) => setFilter('status', value)}>
            <SelectTrigger className="w-40 bg-background">
              <Text as="span" variant="body" truncate>
                <Text as="span" variant="body" tone="muted">
                  Status:{' '}
                </Text>
                {filterStatus ? STATUS_LABELS[filterStatus] : 'All'}
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

          <Select value={filterPriority ?? 'all'} onValueChange={(value) => setFilter('priority', value)}>
            <SelectTrigger className="w-40 bg-background">
              <Text as="span" variant="body" truncate>
                <Text as="span" variant="body" tone="muted">
                  Priority:{' '}
                </Text>
                {filterPriority ? PRIORITY_LABELS[filterPriority] : 'All'}
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
        </Stack>

        <AgendaItemsTable
          items={items}
          isLoading={isLoading}
          showListColumn={!listId}
          timeZone={timeZone}
          page={page}
          currentPage={currentPage}
          totalPages={totalPages}
          deletingItemId={deleteMutation.isPending ? deleteMutation.variables : undefined}
          onPageChange={setPage}
          onToggleDone={handleToggleDone}
          onEdit={openItem}
          onDelete={setItemToDelete}
          onDateChange={handleDateChange}
        />
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

      {/* Delete item confirmation */}
      <ConfirmDialog
        open={itemToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
        title={`Delete "${itemToDelete?.title}"?`}
        description="This agenda item will be permanently removed."
        onConfirm={handleDeleteItem}
        confirmLabel="Delete"
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
