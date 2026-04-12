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
  stats: () => [...memoriesKeys.all, 'stats'] as const,
};

type MemoryHealthStats = {
  total: number;
  pinned: number;
  stale: number;
  byCategory: Record<string, number>;
  byConfidence: Record<string, number>;
  avgAccessCount: number;
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
};

export const memoryStatsQueryOptions = queryOptions({
  queryKey: memoriesKeys.stats(),
  queryFn: async (): Promise<MemoryHealthStats> => {
    const res = await serverFetch(`/memory/stats`);
    if (!res.ok) throw new Error('Failed to fetch memory stats');
    return res.json() as Promise<MemoryHealthStats>;
  },
});

export const semanticMemoriesQueryOptions = (input: {
  page: number;
  pageSize: number;
  source?: import('@stitch/shared/memory/types').MemorySource;
  category?: import('@stitch/shared/memory/types').MemoryCategory;
}) =>
  queryOptions({
    queryKey: [
      ...memoriesKeys.semantic(),
      input.source ?? 'all',
      input.category ?? 'all',
      input.page,
      input.pageSize,
    ],
    queryFn: async (): Promise<
      import('@stitch/shared/memory/types').ListSemanticMemoriesResponse
    > => {
      const params = new URLSearchParams();
      params.set('page', String(input.page));
      params.set('pageSize', String(input.pageSize));
      if (input.source) params.set('source', input.source);
      if (input.category) params.set('category', input.category);
      const res = await serverFetch(`/memory/semantic?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch memories');
      return res.json() as Promise<
        import('@stitch/shared/memory/types').ListSemanticMemoriesResponse
      >;
    },
  });

export const semanticMemorySearchQueryOptions = (input: {
  q: string;
  page: number;
  pageSize: number;
  source?: import('@stitch/shared/memory/types').MemorySource;
  category?: import('@stitch/shared/memory/types').MemoryCategory;
}) =>
  queryOptions({
    queryKey: [
      ...memoriesKeys.semanticSearch(input.q),
      input.source ?? 'all',
      input.category ?? 'all',
      input.page,
      input.pageSize,
    ],
    queryFn: async (): Promise<
      import('@stitch/shared/memory/types').SearchSemanticMemoriesResponse
    > => {
      const params = new URLSearchParams({
        q: input.q,
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      if (input.source) params.set('source', input.source);
      if (input.category) params.set('category', input.category);
      const res = await serverFetch(`/memory/semantic?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to search memories');
      return res.json() as Promise<
        import('@stitch/shared/memory/types').SearchSemanticMemoriesResponse
      >;
    },
    enabled: input.q.trim().length > 0,
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

export function pinMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, { id: string; pinned: boolean }> {
  return {
    mutationFn: async ({ id, pinned }) => {
      const res = await serverFetch(`/memory/semantic/${id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error('Failed to pin memory');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
    },
    onError: (err) => toast.error(err.message),
  };
}

export function pruneMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, void> {
  return {
    mutationFn: async () => {
      const res = await serverFetch('/memory/prune', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to prune memories');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Stale memories pruned');
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

type MaintenanceResult = {
  pruned: number;
  deduplicated: number;
  stats: MemoryHealthStats | null;
};

export function runMaintenanceMutationOptions(
  queryClient: QueryClient,
): MutationOptions<MaintenanceResult, Error, void> {
  return {
    mutationFn: async () => {
      const res = await serverFetch('/memory/maintenance', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run memory maintenance');
      return res.json() as Promise<MaintenanceResult>;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      const parts: string[] = [];
      if (result.pruned > 0) parts.push(`${result.pruned} pruned`);
      if (result.deduplicated > 0) parts.push(`${result.deduplicated} deduplicated`);
      toast.success(parts.length > 0 ? `Maintenance complete: ${parts.join(', ')}` : 'Maintenance complete — nothing to clean up');
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
