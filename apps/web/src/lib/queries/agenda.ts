import { toast } from 'sonner';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  AgendaItemPriority,
  AgendaItemStatus,
  AgendaListWithCounts,
  ListAgendaItemsResponse,
} from '@stitch/shared/agenda/types';

import { serverFetch } from '@/lib/api';

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
    queryFn: async (): Promise<{ lists: AgendaListWithCounts[] }> => {
      const params = new URLSearchParams();
      if (includeArchived) params.set('includeArchived', 'true');
      const res = await serverFetch(`/agenda/lists?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch agenda lists');
      return res.json() as Promise<{ lists: AgendaListWithCounts[] }>;
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
    queryFn: async (): Promise<ListAgendaItemsResponse> => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      if (input.listId) params.set('listId', input.listId);
      if (input.status) params.set('status', input.status);
      if (input.priority) params.set('priority', input.priority);
      const res = await serverFetch(`/agenda/items?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch agenda items');
      return res.json() as Promise<ListAgendaItemsResponse>;
    },
  });
}

export function useCreateAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; color?: string }) => {
      const res = await serverFetch('/agenda/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create list');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('List created');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      updates: { name?: string; description?: string; color?: string | null; isArchived?: boolean };
    }) => {
      const res = await serverFetch(`/agenda/lists/${input.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.updates),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update list');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('List updated');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAgendaList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/agenda/lists/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete list');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('List deleted');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCreateAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      status?: AgendaItemStatus;
      priority?: AgendaItemPriority;
      dueAt?: number | null;
      listId?: string;
      listName?: string;
    }) => {
      const res = await serverFetch('/agenda/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create item');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item created');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      updates: {
        title?: string;
        description?: string;
        status?: AgendaItemStatus;
        priority?: AgendaItemPriority;
        dueAt?: number | null;
        listId?: string;
      };
    }) => {
      const res = await serverFetch(`/agenda/items/${input.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.updates),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update item');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item updated');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/agenda/items/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete item');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item deleted');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useMergeAgendaLists() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { targetId: string; sourceId: string }) => {
      const res = await serverFetch(`/agenda/lists/${input.targetId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: input.sourceId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to merge lists');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Lists merged');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useMoveAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; listId: string }) => {
      const res = await serverFetch(`/agenda/items/${input.itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: input.listId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to move item');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.all });
      toast.success('Item moved');
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useReorderAgendaItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await serverFetch('/agenda/items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to reorder items');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.items() });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useReorderAgendaLists() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await serverFetch('/agenda/lists/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to reorder lists');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKeys.lists() });
    },
    onError: (err) => toast.error(err.message),
  });
}
