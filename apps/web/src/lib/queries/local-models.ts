import { queryOptions } from '@tanstack/react-query';

import type { LocalProviderId } from '@stitch/shared/providers/types';

import { serverRequest } from '@/lib/api';

export type LocalModality = 'text' | 'audio' | 'image' | 'video' | 'pdf';

export type LocalModel = {
  provider: LocalProviderId;
  id: string;
  name: string;
  contextWindow: number;
  inputLimit: number | null;
  outputLimit: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  cacheReadCostPerMillion: number | null;
  cacheWriteCostPerMillion: number | null;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  inputModalities: LocalModality[];
  outputModalities: LocalModality[];
  createdAt: number;
  updatedAt: number;
};

export type LocalModelInput = {
  id: string;
  name: string;
  contextWindow: number;
  inputLimit?: number;
  outputLimit: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  cacheReadCostPerMillion?: number;
  cacheWriteCostPerMillion?: number;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  inputModalities: LocalModality[];
  outputModalities: LocalModality[];
};

export type DiscoveredModel = {
  id: string;
  name: string;
  contextWindow?: number;
  outputLimit?: number;
  supportsToolCalls?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  inputModalities?: LocalModality[];
  outputModalities?: LocalModality[];
};

export const localModelKeys = {
  all: (provider: LocalProviderId) => ['local-models', provider] as const,
  list: (provider: LocalProviderId) => [...localModelKeys.all(provider), 'list'] as const,
  discover: (provider: LocalProviderId) => [...localModelKeys.all(provider), 'discover'] as const,
  health: (provider: LocalProviderId) => [...localModelKeys.all(provider), 'health'] as const,
};

export const localModelsQueryOptions = (provider: LocalProviderId) =>
  queryOptions({
    queryKey: localModelKeys.list(provider),
    queryFn: () => serverRequest<LocalModel[]>(`/llm/local/${provider}/models`),
  });

export const discoverLocalModelsQueryOptions = (provider: LocalProviderId) =>
  queryOptions({
    queryKey: localModelKeys.discover(provider),
    enabled: false,
    queryFn: () => serverRequest<DiscoveredModel[]>(`/llm/local/${provider}/models/discover`),
  });

export const localProviderHealthQueryOptions = (provider: LocalProviderId) =>
  queryOptions({
    queryKey: localModelKeys.health(provider),
    queryFn: () => serverRequest<{ reachable: boolean }>(`/llm/local/${provider}/models/health`),
    staleTime: 30_000,
  });
