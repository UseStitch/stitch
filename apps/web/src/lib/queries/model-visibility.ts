import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';
import { providerKeys } from '@/lib/queries/providers';

type VisibilityOverride = { providerId: string; modelId: string; visibility: 'show' | 'hide' };

const modelVisibilityKeys = {
  all: ['models', 'visibility'] as const,
  list: () => [...modelVisibilityKeys.all, 'list'] as const,
};

export const modelVisibilityQueryOptions = queryOptions({
  queryKey: modelVisibilityKeys.list(),
  queryFn: () => serverRequest<VisibilityOverride[]>('/llm/models/visibility'),
});

export function useSetModelVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      modelId,
      visibility,
    }: {
      providerId: string;
      modelId: string;
      visibility: 'show' | 'hide';
    }) =>
      serverRequest<void>(`/llm/models/visibility/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelVisibilityKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.visibleModels() });
    },
  });
}

export function useResetModelVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string }) =>
      serverRequest<void>(`/llm/models/visibility/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`, {
        method: 'DELETE',
      }).catch((err) => {
        if (err instanceof Error && err.message.includes('status 404')) return;
        throw err;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelVisibilityKeys.all });
      void queryClient.invalidateQueries({ queryKey: providerKeys.visibleModels() });
    },
  });
}
