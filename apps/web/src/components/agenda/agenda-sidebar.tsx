import { ArrowRightIcon, FolderIcon, ListTodoIcon, MergeIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import type { AgendaListWithCounts } from '@stitch/shared/agenda/types';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  agendaListsQueryOptions,
  useCreateAgendaList,
  useMergeAgendaLists,
  useReorderAgendaLists,
  useUpdateAgendaItem,
} from '@/lib/queries/agenda';
import { cn } from '@/lib/utils';

function getDragType(e: React.DragEvent): 'agenda-list' | 'agenda-item' | null {
  if (e.dataTransfer.types.includes('application/x-agenda-list')) return 'agenda-list';
  if (e.dataTransfer.types.includes('application/x-agenda-item')) return 'agenda-item';
  return null;
}

type ListRowProps = {
  list: AgendaListWithCounts;
  isActive: boolean;
  isDragging: boolean;
  mergeIndicator: 'list' | 'item' | null;
  onDragStart: () => void;
  onMoveItem: (itemId: string, listId: string) => void;
};

function ListRow({ list, isActive, isDragging, mergeIndicator, onDragStart, onMoveItem }: ListRowProps) {
  const openCount = list.itemCounts.open + list.itemCounts.in_progress;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/x-agenda-list', list.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('application/x-agenda-item');
    if (itemId) {
      onMoveItem(itemId, list.id);
    }
  }

  return (
    <InternalSidebar.Item
      itemProps={{
        draggable: true,
        onDragStart: handleDragStart,
        onDrop: handleDrop,
        className: cn(
          'group/listrow rounded-md transition-all',
          isDragging && 'opacity-40',
          mergeIndicator && 'ring-2 ring-primary bg-primary/10',
        ),
      }}
      isActive={isActive}
      className="h-auto py-1.5"
      render={<Link to="/agenda/$listId" params={{ listId: list.id }} className="flex items-center gap-2" />}>
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm">{list.name}</span>
          {mergeIndicator ? (
            <Badge variant="default" size="xs" className="animate-in zoom-in-95 fade-in">
              {mergeIndicator === 'list' ? (
                <span className="flex items-center gap-0.5">
                  <MergeIcon className="size-2.5" />
                  Merge
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <ArrowRightIcon className="size-2.5" />
                  Move
                </span>
              )}
            </Badge>
          ) : openCount > 0 ? (
            <Badge variant="secondary" size="xs">
              {openCount}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{list.itemCounts.total} items</span>
          {list.itemCounts.overdue > 0 && (
            <>
              <span>·</span>
              <span className="text-destructive">{list.itemCounts.overdue} overdue</span>
            </>
          )}
          {list.itemCounts.dueSoon > 0 && (
            <>
              <span>·</span>
              <span className="text-warning">{list.itemCounts.dueSoon} due soon</span>
            </>
          )}
        </div>
      </div>
    </InternalSidebar.Item>
  );
}

export function AgendaSidebarContent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const selectedListId = typeof params.listId === 'string' ? params.listId : null;

  const { data } = useQuery(agendaListsQueryOptions());
  const lists = data?.lists ?? [];

  const createListMutation = useCreateAgendaList();
  const mergeMutation = useMergeAgendaLists();
  const moveItemMutation = useUpdateAgendaItem();
  const reorderMutation = useReorderAgendaLists();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');
  const [newListDescription, setNewListDescription] = React.useState('');

  const [dragListId, setDragListId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    function clearDrag() {
      setDragListId(null);
      setDropIndex(null);
      setMergeTargetId(null);
    }
    document.addEventListener('dragend', clearDrag);
    return () => document.removeEventListener('dragend', clearDrag);
  }, []);

  function handleListDragOver(e: React.DragEvent, index: number) {
    const dragType = getDragType(e);
    if (!dragType) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (dragType === 'agenda-item') {
      setDropIndex(null);
      setMergeTargetId(lists[index].id);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;

    if (ratio < 0.3) {
      setMergeTargetId(null);
      setDropIndex(index);
    } else if (ratio > 0.7) {
      setMergeTargetId(null);
      setDropIndex(index + 1);
    } else {
      setDropIndex(null);
      setMergeTargetId(lists[index].id);
    }
  }

  function handleListDrop(e: React.DragEvent) {
    e.preventDefault();

    const listSourceId = e.dataTransfer.getData('application/x-agenda-list');
    const itemId = e.dataTransfer.getData('application/x-agenda-item');

    if (itemId && mergeTargetId) {
      moveItemMutation.mutate({ id: itemId, updates: { listId: mergeTargetId } });
    } else if (listSourceId && mergeTargetId && listSourceId !== mergeTargetId) {
      mergeMutation.mutate(
        { targetId: mergeTargetId, sourceId: listSourceId },
        {
          onSuccess: () => {
            void navigate({ to: '/agenda/$listId', params: { listId: mergeTargetId } });
          },
        },
      );
    } else if (listSourceId && dropIndex !== null) {
      const currentIndex = lists.findIndex((l) => l.id === listSourceId);
      if (currentIndex !== -1 && currentIndex !== dropIndex && currentIndex + 1 !== dropIndex) {
        const newOrder = lists.map((l) => l.id as string).filter((id) => id !== listSourceId);
        const insertAt = dropIndex > currentIndex ? dropIndex - 1 : dropIndex;
        newOrder.splice(insertAt, 0, listSourceId);
        reorderMutation.mutate(newOrder);
      }
    }

    setDragListId(null);
    setDropIndex(null);
    setMergeTargetId(null);
  }

  function handleMoveItem(itemId: string, listId: string) {
    moveItemMutation.mutate({ id: itemId, updates: { listId } });
  }

  function handleCreateList() {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    createListMutation.mutate(
      { name: trimmed, description: newListDescription.trim() || undefined },
      {
        onSuccess: () => {
          setNewListName('');
          setNewListDescription('');
          setCreateOpen(false);
        },
      },
    );
  }

  return (
    <>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <Link to="/agenda" className="flex min-w-0 items-center gap-2 truncate">
              <ListTodoIcon className="size-4 shrink-0" />
              <span className="truncate">Agenda</span>
            </Link>
          </InternalSidebar.TopTitle>
          <InternalSidebar.TopAction
            onClick={() => {
              setNewListName('');
              setNewListDescription('');
              setCreateOpen(true);
            }}
            aria-label="Create list">
            <PlusIcon className="size-3.5" />
          </InternalSidebar.TopAction>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        <InternalSidebar.Group title="Lists">
          <InternalSidebar.List
            onDrop={handleListDrop}
            onDragOver={(e) => {
              if (getDragType(e)) e.preventDefault();
            }}>
            {lists.map((list, index) => {
              const showDropBefore = dropIndex === index && dragListId && dragListId !== list.id;
              const isMergeTarget = mergeTargetId === list.id && dragListId !== list.id;
              return (
                <React.Fragment key={list.id}>
                  {showDropBefore && <div className="mx-2 h-0.5 rounded bg-primary" />}
                  <div onDragOver={(e) => handleListDragOver(e, index)}>
                    <ListRow
                      list={list}
                      isActive={list.id === selectedListId}
                      isDragging={dragListId === list.id}
                      mergeIndicator={isMergeTarget ? 'list' : mergeTargetId === list.id && !dragListId ? 'item' : null}
                      onDragStart={() => setDragListId(list.id)}
                      onMoveItem={handleMoveItem}
                    />
                  </div>
                </React.Fragment>
              );
            })}
            {dropIndex === lists.length && dragListId && <div className="mx-2 h-0.5 rounded bg-primary" />}
            {lists.length === 0 && (
              <InternalSidebar.EmptyState
                icon={ListTodoIcon}
                title="No lists yet"
                description="Click + to create your first list."
                className="py-8"
              />
            )}
          </InternalSidebar.List>
        </InternalSidebar.Group>
      </InternalSidebar.Content>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                placeholder="List name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newListName.trim()) handleCreateList();
                }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="What is this list for?"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                className="min-h-16 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListName.trim() || createListMutation.isPending}>
              {createListMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
