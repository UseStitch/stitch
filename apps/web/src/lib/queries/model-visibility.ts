import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';
import { providerKeys } from '@/lib/queries/providers';

type VisibilityOverride = {
  providerId: string;
  modelId: string;
  visibility: 'show' | 'hide';
};

const modelVisibilityKeys = {
  all: ['models', 'visibility'] as const,
  list: () => [...modelVisibilityKeys.all, 'list'] as const,
};

export const modelVisibilityQueryOptions = queryOptions({
  queryKey: modelVisibilityKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<VisibilityOverride[]> => {
    const res = await serverFetch('/llm/models/visibility');
    if (!res.ok) throw new Error('Failed to fetch model visibility overrides');
    return res.json() as Promise<VisibilityOverride[]>;
  },
});

export function useSetModelVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      providerId,
      modelId,
      visibility,
    }: {
      providerId: string;
      modelId: string;
      visibility: 'show' | 'hide';
    }) => {
      const res = await serverFetch(
        `/llm/models/visibility/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to update model visibility');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelVisibilityKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.visibleModels() });
    },
  });
}

export function useResetModelVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, modelId }: { providerId: string; modelId: string }) => {
      const res = await serverFetch(
        `/llm/models/visibility/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to reset model visibility');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelVisibilityKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.visibleModels() });
    },
  });
}
