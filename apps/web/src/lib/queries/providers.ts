import { queryOptions } from '@tanstack/react-query';

import type { EmbeddingProviderModels } from '@stitch/shared/embedding/types';
import { buildDefaultVisibleSet, isModelVisible } from '@stitch/shared/providers/model-visibility';
import type { SttProviderModels } from '@stitch/shared/stt/types';

import { serverRequest } from '@/lib/api';

export type ProviderCapability = 'llm' | 'stt' | 'embedding';

export type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  enabled: boolean;
  capabilities: ProviderCapability[];
};

export type ModelSummary = {
  id: string;
  name: string;
  family?: string;
  release_date?: string;
  cost?: Record<string, unknown>;
  limit?: {
    context: number;
    input?: number;
    output: number;
  };
  modalities?: {
    input: string[];
    output: string[];
  };
};

export type ProviderModels = {
  providerId: string;
  providerName: string;
  models: ModelSummary[];
};

type ProviderCredentials = Record<string, unknown>;

export const providerKeys = {
  all: ['providers'] as const,
  list: () => [...providerKeys.all, 'list'] as const,
  config: (providerId: string) => [...providerKeys.all, 'config', providerId] as const,
  enabledModels: () => [...providerKeys.all, 'enabled-models'] as const,
  visibleModels: () => [...providerKeys.all, 'visible-models'] as const,
  embeddingModels: () => [...providerKeys.all, 'embedding-models'] as const,
  sttModels: () => [...providerKeys.all, 'stt-models'] as const,
};

export const providersQueryOptions = queryOptions({
  queryKey: providerKeys.list(),
  staleTime: 60 * 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: () => serverRequest<ProviderSummary[]>('/providers'),
});

export const enabledProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.enabledModels(),
  staleTime: 60 * 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: async (): Promise<ProviderModels[]> => {
    const providers = await serverRequest<ProviderSummary[]>('/providers');
    const enabled = providers.filter((p) => p.enabled && p.capabilities.includes('llm'));

    if (enabled.length === 0) return [];

    const results = await Promise.all(
      enabled.map(async (provider) => {
        try {
          const models = await serverRequest<ModelSummary[]>(`/llm/provider/${provider.id}/models`);
          return { providerId: provider.id, providerName: provider.name, models };
        } catch {
          return { providerId: provider.id, providerName: provider.name, models: [] };
        }
      }),
    );
    return results.filter((r) => r.models.length > 0);
  },
});

export const visibleProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.visibleModels(),
  staleTime: 60 * 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: async (): Promise<ProviderModels[]> => {
    const [providers, overridesList] = await Promise.all([
      serverRequest<ProviderSummary[]>('/providers'),
      serverRequest<
        Array<{
          providerId: string;
          modelId: string;
          visibility: 'show' | 'hide';
        }>
      >('/llm/models/visibility'),
    ]);

    const enabled = providers.filter((p) => p.enabled && p.capabilities.includes('llm'));
    if (enabled.length === 0) return [];

    const allProviderModels = await Promise.all(
      enabled.map(async (provider) => {
        try {
          const models = await serverRequest<ModelSummary[]>(`/llm/provider/${provider.id}/models`);
          return { providerId: provider.id, providerName: provider.name, models };
        } catch {
          return {
            providerId: provider.id,
            providerName: provider.name,
            models: [] as ModelSummary[],
          };
        }
      }),
    );

    const defaultVisibleSet = buildDefaultVisibleSet(
      allProviderModels.map((p) => ({
        providerId: p.providerId,
        models: p.models.map((m) => ({ id: m.id, family: m.family, release_date: m.release_date })),
      })),
    );

    const overridesMap = new Map(
      overridesList.map((o) => [`${o.providerId}:${o.modelId}`, o.visibility]),
    );

    return allProviderModels
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((m) =>
          isModelVisible(provider.providerId, m.id, overridesMap, defaultVisibleSet),
        ),
      }))
      .filter((p) => p.models.length > 0);
  },
});

export const providerConfigQueryOptions = (providerId: string) =>
  queryOptions({
    queryKey: providerKeys.config(providerId),
    queryFn: () =>
      serverRequest<ProviderCredentials | null>(`/llm/provider/${providerId}/config`).catch(
        (err) => {
          if (err instanceof Error && err.message.includes('status 404')) return null;
          throw err;
        },
      ),
  });

export const embeddingProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.embeddingModels(),
  staleTime: 60 * 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: () => serverRequest<EmbeddingProviderModels[]>('/llm/provider/embedding-models'),
});

export const sttProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.sttModels(),
  staleTime: 60 * 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: () => serverRequest<SttProviderModels[]>('/providers/stt/models'),
});
