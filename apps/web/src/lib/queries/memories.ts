import { toast } from 'sonner';

import { queryOptions, type MutationOptions, type QueryClient } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';

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
  queryFn: () => serverRequest<MemoryHealthStats>(`/memory/stats`),
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
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(input.page));
      params.set('pageSize', String(input.pageSize));
      if (input.source) params.set('source', input.source);
      if (input.category) params.set('category', input.category);
      return serverRequest<import('@stitch/shared/memory/types').ListSemanticMemoriesResponse>(
        `/memory/semantic?${params.toString()}`,
      );
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
    queryFn: () => {
      const params = new URLSearchParams({
        q: input.q,
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      if (input.source) params.set('source', input.source);
      if (input.category) params.set('category', input.category);
      return serverRequest<import('@stitch/shared/memory/types').SearchSemanticMemoriesResponse>(
        `/memory/semantic?${params.toString()}`,
      );
    },
    enabled: input.q.trim().length > 0,
  });

export function updateMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, { id: string; updates: SemanticMemoryUpdate }> {
  return {
    mutationFn: ({ id, updates }) =>
      serverRequest<void>(`/memory/semantic/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Memory updated', { id: 'memory-update' });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-update' }),
  };
}

export function pinMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, { id: string; pinned: boolean }> {
  return {
    mutationFn: ({ id, pinned }) =>
      serverRequest<void>(`/memory/semantic/${id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-pin' }),
  };
}

export function pruneMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, void> {
  return {
    mutationFn: () => serverRequest<void>('/memory/prune', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Stale memories pruned', { id: 'memory-prune' });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-prune' }),
  };
}

export function deleteMemoryMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, string> {
  return {
    mutationFn: (id) => serverRequest<void>(`/memory/semantic/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success('Memory deleted', { id: 'memory-delete' });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-delete' }),
  };
}

export function bulkDeleteMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, string[]> {
  return {
    mutationFn: (ids) =>
      serverRequest<void>('/memory/semantic', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (_, ids) => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      toast.success(`${ids.length} ${ids.length === 1 ? 'memory' : 'memories'} deleted`, {
        id: 'memory-bulk-delete',
      });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-bulk-delete' }),
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
    mutationFn: () => serverRequest<MaintenanceResult>('/memory/maintenance', { method: 'POST' }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
      const parts: string[] = [];
      if (result.pruned > 0) parts.push(`${result.pruned} pruned`);
      if (result.deduplicated > 0) parts.push(`${result.deduplicated} deduplicated`);
      toast.success(
        parts.length > 0
          ? `Maintenance complete: ${parts.join(', ')}`
          : 'Maintenance complete — nothing to clean up',
        { id: 'memory-maintenance' },
      );
    },
    onError: (err) => toast.error(err.message, { id: 'memory-maintenance' }),
  };
}

export function resetMemoriesMutationOptions(
  queryClient: QueryClient,
): MutationOptions<void, Error, void> {
  return {
    mutationFn: () => serverRequest<void>('/memory/reset', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesKeys.all });
    },
    onError: (err) => toast.error(err.message, { id: 'memory-reset' }),
  };
}
