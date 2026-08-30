import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  Automation,
  AutomationSortField,
  CreateAutomationInput,
  DeleteAutomationInput,
  ListAutomationsResponse,
  RunAutomationResponse,
  UpdateAutomationInput,
} from '@stitch/shared/automations/types';
import type { Session } from '@stitch/shared/chat/messages';
import type { SortDirection } from '@stitch/shared/pagination';

import { serverRequest } from '@/lib/api';

const automationKeys = {
  all: ['automations'] as const,
  page: (input: { page: number; pageSize: number; sort: AutomationSortField; sortDirection: SortDirection }) =>
    [...automationKeys.all, 'page', input] as const,
  detail: (automationId: string) => [...automationKeys.all, 'detail', automationId] as const,
  sidebarList: () => [...automationKeys.all, 'sidebar-list', 'updatedAt', 'desc'] as const,
  sessions: (automationId: string) => [...automationKeys.all, 'sessions', automationId] as const,
};

export function automationsPageQueryOptions(input: {
  page: number;
  pageSize: number;
  sort: AutomationSortField;
  sortDirection: SortDirection;
}) {
  return queryOptions({
    queryKey: automationKeys.page(input),
    queryFn: () => serverRequest<ListAutomationsResponse>('/automations', { params: input }),
    placeholderData: keepPreviousData,
  });
}

const AUTOMATIONS_SIDEBAR_PAGE_SIZE = 50;

export const automationsSidebarListQueryOptions = infiniteQueryOptions({
  queryKey: automationKeys.sidebarList(),
  queryFn: ({ pageParam }) =>
    serverRequest<ListAutomationsResponse>('/automations', {
      params: { page: pageParam, pageSize: AUTOMATIONS_SIDEBAR_PAGE_SIZE, sort: 'updatedAt', sortDirection: 'desc' },
    }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => {
    if (lastPage.page >= lastPage.totalPages) return undefined;
    return lastPage.page + 1;
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
    mutationFn: ({ automationId, input }: { automationId: string; input: DeleteAutomationInput }) =>
      serverRequest<void>(`/automations/${automationId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
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
