import { FolderIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import type { AgendaListWithCounts } from '@stitch/shared/agenda/types';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { agendaListsQueryOptions, useCreateAgendaList } from '@/lib/queries/agenda';

type ListRowProps = { list: AgendaListWithCounts; isActive: boolean };

function ListRow({ list, isActive }: ListRowProps) {
  const openCount = list.itemCounts.open + list.itemCounts.in_progress;

  return (
    <InternalSidebar.Item
      itemProps={{ className: 'group/listrow rounded-md transition-all' }}
      isActive={isActive}
      className="h-auto py-space-s"
      render={<Link to="/agenda/$listId" params={{ listId: list.id }} className="flex items-center gap-space-m" />}>
      <Icon as={FolderIcon} size="s" tone="muted" />
      <div className="min-w-0 flex-1">
        <Stack direction="row" align="center" justify="between" gap="m">
          <Text as="span" variant="body" truncate>
            {list.name}
          </Text>
          {openCount > 0 ? (
            <Badge variant="secondary" size="xs">
              {openCount}
            </Badge>
          ) : null}
        </Stack>
        <Stack direction="row" align="center" gap="xs">
          <Text as="span" variant="micro" tone="muted">
            {list.itemCounts.total} items
          </Text>
          {list.itemCounts.overdue > 0 && (
            <>
              <Text as="span" variant="micro" tone="muted">
                ·
              </Text>
              <Text as="span" variant="micro" tone="destructive">
                {list.itemCounts.overdue} overdue
              </Text>
            </>
          )}
          {list.itemCounts.dueSoon > 0 && (
            <>
              <Text as="span" variant="micro" tone="muted">
                ·
              </Text>
              <Text as="span" variant="micro" tone="warning">
                {list.itemCounts.dueSoon} due soon
              </Text>
            </>
          )}
        </Stack>
      </div>
    </InternalSidebar.Item>
  );
}

export function AgendaSidebarContent() {
  const params = useParams({ strict: false });
  const selectedListId = typeof params.listId === 'string' ? params.listId : null;

  const { data } = useQuery({ ...agendaListsQueryOptions(), select: (data) => data.lists });
  const lists = data ?? [];

  const createListMutation = useCreateAgendaList();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');
  const [newListDescription, setNewListDescription] = React.useState('');

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
            <Link to="/agenda" className="flex min-w-0 items-center gap-space-m truncate">
              <Icon as={ListTodoIcon} size="m" />
              <Text as="span" variant="body" truncate>
                Agenda
              </Text>
            </Link>
          </InternalSidebar.TopTitle>
          <InternalSidebar.TopAction
            onClick={() => {
              setNewListName('');
              setNewListDescription('');
              setCreateOpen(true);
            }}
            aria-label="Create list">
            <Icon as={PlusIcon} size="s" />
          </InternalSidebar.TopAction>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        <InternalSidebar.Group title="Lists">
          <InternalSidebar.List>
            {lists.map((list) => (
              <ListRow key={list.id} list={list} isActive={list.id === selectedListId} />
            ))}
            {lists.length === 0 && (
              <Empty size="compact">
                <EmptyMedia variant="icon">
                  <Icon as={ListTodoIcon} size="m" />
                </EmptyMedia>
                <EmptyTitle>No lists yet</EmptyTitle>
                <EmptyDescription>Click + to create your first list.</EmptyDescription>
              </Empty>
            )}
          </InternalSidebar.List>
        </InternalSidebar.Group>
      </InternalSidebar.Content>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
          </DialogHeader>
          <Stack gap="xl">
            <Stack gap="s">
              <Label>Name</Label>
              <Input
                placeholder="List name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newListName.trim()) handleCreateList();
                }}
              />
            </Stack>
            <Stack gap="s">
              <Label>
                Description{' '}
                <Text as="span" variant="caption" tone="muted">
                  (optional)
                </Text>
              </Label>
              <Textarea
                placeholder="What is this list for?"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                className="min-h-16 resize-none"
              />
            </Stack>
          </Stack>
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
