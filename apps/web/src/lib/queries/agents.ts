import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';

import { serverFetch } from '@/lib/api';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
};

export const agentsQueryOptions = queryOptions({
  queryKey: agentKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Agent[]> => {
    const res = await serverFetch('/agents');
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json() as Promise<Agent[]>;
  },
});

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      useBasePrompt: boolean;
      systemPrompt: string | null;
    }): Promise<{ id: string }> => {
      const res = await serverFetch('/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create agent');
      }

      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      useBasePrompt?: boolean;
      systemPrompt?: string | null;
    }) => {
      const res = await serverFetch(`/agents/${input.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          useBasePrompt: input.useBasePrompt,
          systemPrompt: input.systemPrompt,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update agent');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await serverFetch(`/agents/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete agent');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

export function useSetDefaultAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    ...saveSettingMutationOptions('agent.default', queryClient, { silent: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryOptions.queryKey });
    },
  });
}
