import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  Automation,
  CreateAutomationInput,
  ListAutomationsResponse,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { Session } from '@stitch/shared/chat/messages';

import { serverRequest } from '@/lib/api';

const automationKeys = {
  all: ['automations'] as const,
  page: (page: number, pageSize: number) => [...automationKeys.all, 'page', page, pageSize] as const,
  detail: (automationId: string) => [...automationKeys.all, 'detail', automationId] as const,
  sidebarList: () => [...automationKeys.all, 'sidebar-list'] as const,
  sessions: (automationId: string) => [...automationKeys.all, 'sessions', automationId] as const,
};

export function automationsPageQueryOptions(input: { page: number; pageSize: number }) {
  return queryOptions({
    queryKey: automationKeys.page(input.page, input.pageSize),
    queryFn: () =>
      serverRequest<ListAutomationsResponse>('/automations', {
        params: { page: input.page, pageSize: input.pageSize },
      }),
  });
}

export const automationsSidebarListQueryOptions = queryOptions({
  queryKey: automationKeys.sidebarList(),
  queryFn: async (): Promise<Automation[]> => {
    const data = await serverRequest<ListAutomationsResponse>('/automations', { params: { page: 1, pageSize: 100 } });
    return data.automations;
  },
});

export const automationQueryOptions = (automationId: string) =>
  queryOptions({
    queryKey: automationKeys.detail(automationId),
    queryFn: () => serverRequest<Automation>(`/automations/${automationId}`),
  });

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationInput) =>
      serverRequest<Automation>('/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ automationId, input }: { automationId: string; input: UpdateAutomationInput }) =>
      serverRequest<Automation>(`/automations/${automationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) => serverRequest<void>(`/automations/${automationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

export const automationSessionsQueryOptions = (automationId: string) =>
  queryOptions({
    queryKey: automationKeys.sessions(automationId),
    queryFn: () => serverRequest<Session[]>(`/automations/${automationId}/sessions`),
    staleTime: 30_000,
  });

export function useRunAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) =>
      serverRequest<RunAutomationResponse>(`/automations/${automationId}/run`, { method: 'POST' }),
    onSuccess: (_data, automationId) => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.sessions(automationId) });
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}
