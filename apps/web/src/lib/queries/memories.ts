import { toast } from 'sonner';

import { queryOptions, type MutationOptions, type QueryClient } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';

export type {
  MemoryCategory,
  MemoryConfidence,
  MemorySource,
  SemanticMemory,
} from '@stitch/shared/memory/types';

type SemanticMemoryUpdate = {
  content?: string;
  category?: import('@stitch/shared/memory/types').MemoryCategory;
  confidence?: import('@stitch/shared/memory/types').MemoryConfidence;
};

const memoriesKeys = {
  all: ['memories'] as const,
  semantic: () => [...memoriesKeys.all, 'semantic'] as const,
  semanticSearch: (q: string) => [...memoriesKeys.semantic(), 'search', q] as const,
};

export const semanticMemoriesQueryOptions = (source?: import('@stitch/shared/memory/types').MemorySource) =>
  queryOptions({
    queryKey: [...memoriesKeys.semantic(), source ?? 'all'],
    queryFn: async (): Promise<import('@stitch/shared/memory/types').SemanticMemory[]> => {
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      const res = await serverFetch(`/memory/semantic?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch memories');
      return res.json() as Promise<import('@stitch/shared/memory/types').SemanticMemory[]>;
    },
  });

export const semanticMemorySearchQueryOptions = (q: string) =>
  queryOptions({
    queryKey: memoriesKeys.semanticSearch(q),
    queryFn: async (): Promise<import('@stitch/shared/memory/types').SemanticMemory[]> => {
      const params = new URLSearchParams({ q });
      const res = await serverFetch(`/memory/semantic?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to search memories');
      return res.json() as Promise<import('@stitch/shared/memory/types').SemanticMemory[]>;
    },
    enabled: q.trim().length > 0,
  });

export function updateMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, { id: string; updates: SemanticMemoryUpdate }> {
  return {
    mutationFn: async ({ id, updates }) => {
      const res = await serverFetch(`/memory/semantic/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update memory');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Memory updated');
    },
    onError: (err) => toast.error(err.message),
  };
}

export function deleteMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, string> {
  return {
    mutationFn: async (id) => {
      const res = await serverFetch(`/memory/semantic/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete memory');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Memory deleted');
    },
    onError: (err) => toast.error(err.message),
  };
}

export function bulkDeleteMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, string[]> {
  return {
    mutationFn: async (ids) => {
      const res = await serverFetch('/memory/semantic', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to delete memories');
    },
    onSuccess: (_, ids) => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success(`${ids.length} ${ids.length === 1 ? 'memory' : 'memories'} deleted`);
    },
    onError: (err) => toast.error(err.message),
  };
}

export function resetMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, void> {
  return {
    mutationFn: async () => {
      const res = await serverFetch('/memory/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset memories');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
    },
    onError: (err) => toast.error(err.message),
  };
}
