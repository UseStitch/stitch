import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  Automation,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';

import { serverFetch } from '@/lib/api';

const automationKeys = {
  all: ['automations'] as const,
  list: () => [...automationKeys.all, 'list'] as const,
};

export const automationsQueryOptions = queryOptions({
  queryKey: automationKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Automation[]> => {
    const res = await serverFetch('/automations');
    if (!res.ok) throw new Error('Failed to fetch automations');
    return res.json() as Promise<Automation[]>;
  },
});

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAutomationInput): Promise<Automation> => {
      const res = await serverFetch('/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to create automation');
      }

      return res.json() as Promise<Automation>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      automationId,
      input,
    }: {
      automationId: string;
      input: UpdateAutomationInput;
    }): Promise<Automation> => {
      const res = await serverFetch(`/automations/${automationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update automation');
      }

      return res.json() as Promise<Automation>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (automationId: string): Promise<void> => {
      const res = await serverFetch(`/automations/${automationId}`, { method: 'DELETE' });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete automation');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}
