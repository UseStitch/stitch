import { queryOptions } from '@tanstack/react-query';

import { serverRequest } from '@/lib/api';

export type OllamaModality = 'text' | 'audio' | 'image' | 'video' | 'pdf';

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
  inputModalities: OllamaModality[];
  outputModalities: OllamaModality[];
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
  inputModalities: OllamaModality[];
  outputModalities: OllamaModality[];
};

type DiscoveredModel = { id: string; name: string };

export const ollamaModelKeys = {
  all: ['ollama-models'] as const,
  list: () => [...ollamaModelKeys.all, 'list'] as const,
  discover: (baseURL?: string) => [...ollamaModelKeys.all, 'discover', baseURL] as const,
};

export const ollamaModelsQueryOptions = queryOptions({
  queryKey: ollamaModelKeys.list(),
  queryFn: () => serverRequest<OllamaModel[]>('/llm/ollama/models'),
});

export const discoverOllamaModelsQueryOptions = (baseURL?: string) =>
  queryOptions({
    queryKey: ollamaModelKeys.discover(baseURL),
    enabled: false,
    queryFn: () => {
      const params = baseURL ? `?baseURL=${encodeURIComponent(baseURL)}` : '';
      return serverRequest<DiscoveredModel[]>(`/llm/ollama/models/discover${params}`);
    },
  });
