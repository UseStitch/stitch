import { queryOptions } from '@tanstack/react-query';

import type {
  SttUsageDashboardResponse,
  UsageDashboardResponse,
  UsageDateRange,
} from '@stitch/shared/usage/types';

import { serverFetch } from '@/lib/api';

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
  sttDashboard: (filters: UsageDashboardFilters) =>
    [...usageKeys.all, 'stt-dashboard', filters] as const,
};

function buildQueryString(filters: UsageDashboardFilters): string {
  const params = new URLSearchParams();

  if (filters.providerId) params.set('providerId', filters.providerId);
  if (filters.modelId) params.set('modelId', filters.modelId);
  if (filters.range) params.set('range', filters.range);
  if (filters.from) params.set('from', String(filters.from));
  if (filters.to) params.set('to', String(filters.to));

  return params.toString();
}

export const usageDashboardQueryOptions = (filters: UsageDashboardFilters) =>
  queryOptions({
    queryKey: usageKeys.dashboard(filters),
    queryFn: async (): Promise<UsageDashboardResponse> => {
      const query = buildQueryString(filters);
      const path = query.length > 0 ? `/usage?${query}` : '/usage';

      const res = await serverFetch(path);
      if (!res.ok) throw new Error('Failed to fetch usage dashboard');
      return res.json() as Promise<UsageDashboardResponse>;
    },
    staleTime: 30_000,
  });

export const sttUsageDashboardQueryOptions = (filters: UsageDashboardFilters) =>
  queryOptions({
    queryKey: usageKeys.sttDashboard(filters),
    queryFn: async (): Promise<SttUsageDashboardResponse> => {
      const query = buildQueryString(filters);
      const path = query.length > 0 ? `/usage/stt?${query}` : '/usage/stt';

      const res = await serverFetch(path);
      if (!res.ok) throw new Error('Failed to fetch STT usage dashboard');
      return res.json() as Promise<SttUsageDashboardResponse>;
    },
    staleTime: 30_000,
  });
