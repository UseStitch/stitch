import { toast } from 'sonner';

import { queryOptions, type MutationOptions, type QueryClient } from '@tanstack/react-query';

import type {
  ManagedMemoryEntry,
  MemoryConsolidationResult,
  MemoryFileSnapshot,
  MemoryFilesOverview,
  MemorySearchResult,
  MemoryTarget,
} from '@stitch/shared/memory/types';

import { serverRequest } from '@/lib/api';

export type { ManagedMemoryEntry, MemoryFileSnapshot, MemoryTarget };

const keys = {
  all: ['memories'] as const,
  overview: () => [...keys.all, 'files'] as const,
  search: (query: string) => [...keys.all, 'search', query] as const,
};

export const memoryFilesQueryOptions = queryOptions({
  queryKey: keys.overview(),
  queryFn: () => serverRequest<MemoryFilesOverview>('/memory/files'),
});

export const memorySearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: keys.search(query),
    queryFn: () => serverRequest<{ results: MemorySearchResult[] }>('/memory/search', { params: { q: query } }),
    enabled: query.trim().length > 0,
  });

function invalidate(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.all });
}

export function addMemoryEntryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<MemoryFileSnapshot, Error, { target: MemoryTarget; content: string }> {
  return {
    mutationFn: (input) =>
      serverRequest('/memory/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success('Memory added');
    },
    onError: (error) => toast.error(error.message),
  };
}

export function updateMemoryEntryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<MemoryFileSnapshot, Error, { id: string; content: string; expectedHash?: string }> {
  return {
    mutationFn: ({ id, ...body }) =>
      serverRequest(`/memory/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast.error(error.message),
  };
}

export function deleteMemoryEntryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<MemoryFileSnapshot, Error, { id: string; expectedHash?: string }> {
  return {
    mutationFn: ({ id, expectedHash }) =>
      serverRequest(`/memory/entries/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedHash }),
      }),
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast.error(error.message),
  };
}

export function consolidateMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<MemoryConsolidationResult, Error, void> {
  return {
    mutationFn: () => serverRequest('/memory/consolidate', { method: 'POST' }),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success('Consolidation complete');
    },
    onError: (error) => toast.error(error.message),
  };
}

export function resetMemoriesMutationOptions(queryClient: QueryClient): MutationOptions<void, Error, void> {
  return {
    mutationFn: () =>
      serverRequest('/memory/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast.error(error.message),
  };
}

export function openMemoryFolderMutationOptions(): MutationOptions<void, Error, void> {
  return {
    mutationFn: () => serverRequest('/memory/open-folder', { method: 'POST' }),
    onError: (error) => toast.error(error.message),
  };
}
