import { queryOptions } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';

export type OllamaModel = {
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
  createdAt: number;
  updatedAt: number;
};

export type OllamaModelInput = {
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
};

type DiscoveredModel = {
  id: string;
  name: string;
};

export const ollamaModelKeys = {
  all: ['ollama-models'] as const,
  list: () => [...ollamaModelKeys.all, 'list'] as const,
  discover: (baseURL?: string) => [...ollamaModelKeys.all, 'discover', baseURL] as const,
};

export const ollamaModelsQueryOptions = queryOptions({
  queryKey: ollamaModelKeys.list(),
  queryFn: async (): Promise<OllamaModel[]> => {
    const res = await serverFetch('/llm/ollama/models');
    if (!res.ok) throw new Error('Failed to fetch Ollama models');
    return res.json() as Promise<OllamaModel[]>;
  },
});

export const discoverOllamaModelsQueryOptions = (baseURL?: string) =>
  queryOptions({
    queryKey: ollamaModelKeys.discover(baseURL),
    enabled: false,
    queryFn: async (): Promise<DiscoveredModel[]> => {
      const params = baseURL ? `?baseURL=${encodeURIComponent(baseURL)}` : '';
      const res = await serverFetch(`/llm/ollama/models/discover${params}`);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Failed to discover Ollama models');
      }
      return res.json() as Promise<DiscoveredModel[]>;
    },
  });
