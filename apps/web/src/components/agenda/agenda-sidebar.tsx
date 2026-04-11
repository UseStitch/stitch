import {
  ArrowRightIcon,
  FolderIcon,
  ListTodoIcon,
  MergeIcon,
  PlusIcon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  agendaListsQueryOptions,
  useCreateAgendaList,
  useMergeAgendaLists,
  useMoveAgendaItem,
  useReorderAgendaLists,
} from '@/lib/queries/agenda';
import type { AgendaListWithCounts } from '@stitch/shared/agenda/types';
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

function ListRow({
  list,
  isActive,
  isDragging,
  mergeIndicator,
  onDragStart,
  onMoveItem,
}: ListRowProps) {
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
    <SidebarMenuItem
      draggable
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      className={cn(
        'group/listrow rounded-md transition-all',
        isDragging && 'opacity-40',
        mergeIndicator && 'ring-2 ring-primary bg-primary/10',
      )}
    >
      <SidebarMenuButton
        isActive={isActive}
        className="h-auto py-1.5"
        render={
          <Link
            to="/agenda/$listId"
            params={{ listId: list.id }}
            className="flex items-center gap-2"
          />
        }
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{list.name}</span>
            {mergeIndicator ? (
              <Badge
                variant="default"
                className="animate-in fade-in zoom-in-95 text-[10px] px-1.5 py-0"
              >
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
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {openCount}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{list.itemCounts.total} items</span>
            {list.itemCounts.overdue > 0 && (
              <>
                <span>·</span>
                <span className="text-destructive">
                  {list.itemCounts.overdue} overdue
                </span>
              </>
            )}
            {list.itemCounts.dueSoon > 0 && (
              <>
                <span>·</span>
                <span className="text-warning">
                  {list.itemCounts.dueSoon} due soon
                </span>
              </>
            )}
          </div>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AgendaSidebarContent() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const routerState = useRouterState();
  const selectedListId = typeof params.listId === 'string' ? params.listId : null;
  const isOnIndex = routerState.location.pathname === '/agenda';

  const { data } = useQuery(agendaListsQueryOptions());
  const lists = data?.lists ?? [];

  const createListMutation = useCreateAgendaList();
  const mergeMutation = useMergeAgendaLists();
  const moveMutation = useMoveAgendaItem();
  const reorderMutation = useReorderAgendaLists();

  const [creating, setCreating] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');
  const createInputRef = React.useRef<HTMLInputElement>(null);

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

  React.useEffect(() => {
    if (creating) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [creating]);

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
      moveMutation.mutate({ itemId, listId: mergeTargetId });
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
    moveMutation.mutate({ itemId, listId });
  }

  function handleCreateList() {
    const trimmed = newListName.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    createListMutation.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setNewListName('');
          setCreating(false);
        },
      },
    );
  }

  return (
    <>
      <SidebarHeader className="pb-0">
        <SidebarMenuButton
          isActive={isOnIndex}
          render={<Link to="/agenda" className="flex items-center gap-2 font-medium" />}
        >
          <ListTodoIcon className="size-4" />
          All Items
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Lists</SidebarGroupLabel>
            <button
              type="button"
              className="mr-2 flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setCreating(true);
                setNewListName('');
              }}
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
          <SidebarGroupContent>
            <SidebarMenu
              onDrop={handleListDrop}
              onDragOver={(e) => {
                if (getDragType(e)) e.preventDefault();
              }}
            >
              {creating && (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <Input
                      ref={createInputRef}
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onBlur={handleCreateList}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateList();
                        if (e.key === 'Escape') {
                          setCreating(false);
                          setNewListName('');
                        }
                      }}
                      placeholder="List name..."
                      className="h-6 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                      disabled={createListMutation.isPending}
                    />
                  </div>
                </SidebarMenuItem>
              )}
              {lists.map((list, index) => {
                const showDropBefore =
                  dropIndex === index && dragListId && dragListId !== list.id;
                const isMergeTarget = mergeTargetId === list.id && dragListId !== list.id;
                return (
                  <React.Fragment key={list.id}>
                    {showDropBefore && <div className="mx-2 h-0.5 rounded bg-primary" />}
                    <div onDragOver={(e) => handleListDragOver(e, index)}>
                      <ListRow
                        list={list}
                        isActive={list.id === selectedListId}
                        isDragging={dragListId === list.id}
                        mergeIndicator={
                        isMergeTarget
                          ? 'list'
                          : mergeTargetId === list.id && !dragListId
                            ? 'item'
                            : null
                      }
                        onDragStart={() => setDragListId(list.id)}
                    onMoveItem={handleMoveItem}
                  />
                    </div>
                  </React.Fragment>
                );
              })}
              {dropIndex === lists.length && dragListId && (
                <div className="mx-2 h-0.5 rounded bg-primary" />
              )}
              {!creating && lists.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                  <ListTodoIcon className="size-8 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">No lists yet</p>
                    <p className="text-xs text-muted-foreground/70">
                      Click + to create your first list.
                    </p>
                  </div>
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
