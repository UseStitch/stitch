import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  Automation,
  CreateAutomationInput,
  ListAutomationsResponse,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { Session } from '@stitch/shared/chat/messages';

import { serverFetch } from '@/lib/api';

const automationKeys = {
  all: ['automations'] as const,
  list: (page: number, pageSize: number) =>
    [...automationKeys.all, 'list', page, pageSize] as const,
  sessions: (automationId: string) => [...automationKeys.all, 'sessions', automationId] as const,
};

export function automationsPageQueryOptions(input: { page: number; pageSize: number }) {
  return queryOptions({
    queryKey: automationKeys.list(input.page, input.pageSize),
    staleTime: Infinity,
    queryFn: async (): Promise<ListAutomationsResponse> => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      const res = await serverFetch(`/automations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch automations');
      return res.json() as Promise<ListAutomationsResponse>;
    },
  });
}

export const automationsQueryOptions = queryOptions({
  queryKey: automationKeys.list(1, 1000),
  staleTime: Infinity,
  queryFn: async (): Promise<Automation[]> => {
    const params = new URLSearchParams({ page: '1', pageSize: '1000' });
    const res = await serverFetch(`/automations?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch automations');
    const data = (await res.json()) as ListAutomationsResponse;
    return data.automations;
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

export const automationSessionsQueryOptions = (automationId: string) =>
  queryOptions({
    queryKey: automationKeys.sessions(automationId),
    queryFn: async (): Promise<Session[]> => {
      const res = await serverFetch(`/automations/${automationId}/sessions`);
      if (!res.ok) throw new Error('Failed to fetch automation sessions');
      return res.json() as Promise<Session[]>;
    },
    staleTime: 30_000,
  });

export function useRunAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (automationId: string): Promise<RunAutomationResponse> => {
      const res = await serverFetch(`/automations/${automationId}/run`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to run automation');
      }

      return res.json() as Promise<RunAutomationResponse>;
    },
    onSuccess: (_data, automationId) => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.sessions(automationId) });
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}
