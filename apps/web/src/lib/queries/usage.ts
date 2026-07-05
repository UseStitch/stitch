import { queryOptions } from '@tanstack/react-query';

import type {
  EmbeddingUsageDashboardResponse,
  SttUsageDashboardResponse,
  UsageDashboardResponse,
  UsageDateRange,
} from '@stitch/shared/usage/types';

import { serverRequest } from '@/lib/api';

type UsageDashboardFilters = {
  providerId?: string;
  modelId?: string;
  range?: UsageDateRange;
  from?: number;
  to?: number;
};

const usageKeys = {
  all: ['usage'] as const,
  dashboard: (filters: UsageDashboardFilters) => [...usageKeys.all, 'dashboard', filters] as const,
  sttDashboard: (filters: UsageDashboardFilters) => [...usageKeys.all, 'stt-dashboard', filters] as const,
  embeddingDashboard: (filters: UsageDashboardFilters) => [...usageKeys.all, 'embedding-dashboard', filters] as const,
};

export const usageDashboardQueryOptions = (filters: UsageDashboardFilters) =>
  queryOptions({
    queryKey: usageKeys.dashboard(filters),
    queryFn: () => serverRequest<UsageDashboardResponse>('/usage', { params: filters }),
    staleTime: 30_000,
  });

export const sttUsageDashboardQueryOptions = (filters: UsageDashboardFilters) =>
  queryOptions({
    queryKey: usageKeys.sttDashboard(filters),
    queryFn: () => serverRequest<SttUsageDashboardResponse>('/usage/stt', { params: filters }),
    staleTime: 30_000,
  });

export const embeddingUsageDashboardQueryOptions = (filters: UsageDashboardFilters) =>
  queryOptions({
    queryKey: usageKeys.embeddingDashboard(filters),
    queryFn: () => serverRequest<EmbeddingUsageDashboardResponse>('/usage/embedding', { params: filters }),
    staleTime: 30_000,
  });
