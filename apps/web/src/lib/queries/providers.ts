import { queryOptions } from '@tanstack/react-query';

import { buildDefaultVisibleSet, isModelVisible } from '@stitch/shared/providers/model-visibility';

import { serverFetch } from '@/lib/api';

export type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  model_count: number;
  enabled: boolean;
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
  enabledAudioModels: () => [...providerKeys.all, 'enabled-audio-models'] as const,
  visibleModels: () => [...providerKeys.all, 'visible-models'] as const,
};

export const providersQueryOptions = queryOptions({
  queryKey: providerKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<ProviderSummary[]> => {
    const res = await serverFetch('/provider');
    if (!res.ok) throw new Error('Failed to fetch providers');
    return res.json() as Promise<ProviderSummary[]>;
  },
});

export const enabledProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.enabledModels(),
  staleTime: Infinity,
  queryFn: async (): Promise<ProviderModels[]> => {
    const providersRes = await serverFetch('/provider');
    if (!providersRes.ok) throw new Error('Failed to fetch providers');
    const providers = (await providersRes.json()) as ProviderSummary[];
    const enabled = providers.filter((p) => p.enabled);

    if (enabled.length === 0) return [];

    const results = await Promise.all(
      enabled.map(async (provider) => {
        const res = await serverFetch(`/provider/${provider.id}/models`);
        if (!res.ok) return { providerId: provider.id, providerName: provider.name, models: [] };
        const models = (await res.json()) as ModelSummary[];
        return { providerId: provider.id, providerName: provider.name, models };
      }),
    );
    return results.filter((r) => r.models.length > 0);
  },
});

export const enabledAudioProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.enabledAudioModels(),
  staleTime: Infinity,
  queryFn: async (): Promise<ProviderModels[]> => {
    const res = await serverFetch('/provider/audio-models');
    if (!res.ok) throw new Error('Failed to fetch audio models');
    return res.json() as Promise<ProviderModels[]>;
  },
});

export const visibleProviderModelsQueryOptions = queryOptions({
  queryKey: providerKeys.visibleModels(),
  staleTime: Infinity,
  queryFn: async (): Promise<ProviderModels[]> => {
    const [providersRes, visibilityRes] = await Promise.all([
      serverFetch('/provider'),
      serverFetch('/models/visibility'),
    ]);
    if (!providersRes.ok) throw new Error('Failed to fetch providers');
    if (!visibilityRes.ok) throw new Error('Failed to fetch model visibility');

    const providers = (await providersRes.json()) as ProviderSummary[];
    const overridesList = (await visibilityRes.json()) as Array<{
      providerId: string;
      modelId: string;
      visibility: 'show' | 'hide';
    }>;

    const enabled = providers.filter((p) => p.enabled);
    if (enabled.length === 0) return [];

    const allProviderModels = await Promise.all(
      enabled.map(async (provider) => {
        const res = await serverFetch(`/provider/${provider.id}/models`);
        if (!res.ok)
          return {
            providerId: provider.id,
            providerName: provider.name,
            models: [] as ModelSummary[],
          };
        const models = (await res.json()) as ModelSummary[];
        return { providerId: provider.id, providerName: provider.name, models };
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
    staleTime: Infinity,
    queryFn: async (): Promise<ProviderCredentials | null> => {
      const res = await serverFetch(`/provider/${providerId}/config`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch provider config');
      return res.json() as Promise<ProviderCredentials>;
    },
  });
