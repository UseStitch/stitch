import { toast } from 'sonner';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  AgendaItemPriority,
  AgendaItemStatus,
  AgendaListWithCounts,
  ListAgendaItemsResponse,
} from '@stitch/shared/agenda/types';

import { serverRequest } from '@/lib/api';

const agendaKeys = {
  all: ['agenda'] as const,
  lists: () => [...agendaKeys.all, 'lists'] as const,
  items: () => [...agendaKeys.all, 'items'] as const,
  itemList: (filters: Record<string, string | undefined>) =>
    [...agendaKeys.items(), filters] as const,
  itemDetail: (id: string) => [...agendaKeys.all, 'item', id] as const,
};

export function agendaListsQueryOptions(includeArchived = false) {
  return queryOptions({
    queryKey: [...agendaKeys.lists(), includeArchived],
    queryFn: () => {
      const params = new URLSearchParams();
      if (includeArchived) params.set('includeArchived', 'true');
      return serverRequest<{ lists: AgendaListWithCounts[] }>(`/agenda/lists?${params.toString()}`);
    },
  });
}

export function agendaItemsQueryOptions(input: {
  page: number;
  pageSize: number;
  listId?: string;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
}) {
  return queryOptions({
    queryKey: [
      ...agendaKeys.items(),
      input.listId ?? 'all',
      input.status ?? 'all',
      input.priority ?? 'all',
      input.page,
      input.pageSize,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      if (input.listId) params.set('listId', input.listId);
      if (input.status) params.set('status', input.status);
      if (input.priority) params.set('priority', input.priority);
      return serverRequest<ListAgendaItemsResponse>(`/agenda/items?${params.toString()}`);
    },
  });
}

export function useCreateAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; description?: string; color?: string }) =>
      serverRequest<unknown>('/agenda/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.lists() });
      toast.success('List created');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      updates: { name?: string; description?: string; color?: string | null; isArchived?: boolean };
    }) =>
      serverRequest<unknown>(`/agenda/lists/${input.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.updates),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.lists() });
      toast.success('List updated');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverRequest<void>(`/agenda/lists/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Items are cascade-deleted, so both caches are stale
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('List deleted');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCreateAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      status?: AgendaItemStatus;
      priority?: AgendaItemPriority;
      dueAt?: number | null;
      listId?: string;
      listName?: string;
    }) =>
      serverRequest<unknown>('/agenda/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // New item changes both item list and list counts
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item created');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      updates: {
        title?: string;
        description?: string;
        status?: AgendaItemStatus;
        priority?: AgendaItemPriority;
        dueAt?: number | null;
        listId?: string;
      };
    }) =>
      serverRequest<unknown>(`/agenda/items/${input.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.updates),
      }),
    onSuccess: (_data, variables) => {
      // Status changes affect list counts; listId moves affect both caches
      const touchesListCounts =
        variables.updates.status !== undefined || variables.updates.listId !== undefined;
      if (touchesListCounts) {
        void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      } else {
        void queryClient.invalidateQueries({ queryKey: agendaKeys.items() });
      }
      toast.success('Item updated');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverRequest<void>(`/agenda/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Deleted item changes both item list and list counts
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item deleted');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useMergeAgendaLists() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { targetId: string; sourceId: string }) =>
      serverRequest<unknown>(`/agenda/lists/${input.targetId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: input.sourceId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Lists merged');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useReorderAgendaItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      serverRequest<void>('/agenda/items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.items() });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useReorderAgendaLists() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      serverRequest<void>('/agenda/lists/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.lists() });
    },
    onError: (err) => toast.error(err.message),
  });
}
