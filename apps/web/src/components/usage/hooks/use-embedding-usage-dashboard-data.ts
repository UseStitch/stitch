import * as React from 'react';

import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { UsageDateRange } from '@stitch/shared/usage/types';

import {
  ALL_FILTER,
  RANGE_LABELS,
  decodeModelFilter,
  encodeModelFilter,
} from '@/components/usage/utils/usage-dashboard-utils';
import { embeddingProviderModelsQueryOptions } from '@/lib/queries/providers';
import { embeddingUsageDashboardQueryOptions } from '@/lib/queries/usage';

type EmbeddingProviderOption = { providerId: string; providerName: string };

type EmbeddingModelOption = {
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
};

export function useEmbeddingUsageDashboardData(rangeFilter: UsageDateRange) {
  const { data: embeddingProviderModels } = useSuspenseQuery(embeddingProviderModelsQueryOptions);

  const [selectedProvider, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [selectedModel, setModelFilter] = React.useState<string>(ALL_FILTER);

  const { data: usageRangeData } = useQuery({
    ...embeddingUsageDashboardQueryOptions({ range: rangeFilter }),
    placeholderData: keepPreviousData,
  });

  const providerById = React.useMemo(
    () => new Map(embeddingProviderModels.map((p) => [p.providerId, p] as const)),
    [embeddingProviderModels],
  );

  const modelNameByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of embeddingProviderModels) {
      for (const model of provider.models) {
        map.set(encodeModelFilter(provider.providerId, model.id), model.name);
      }
    }
    return map;
  }, [embeddingProviderModels]);

  const availableProviders = React.useMemo<EmbeddingProviderOption[]>(() => {
    const used = new Set(usageRangeData?.usedProviders ?? []);
    return embeddingProviderModels.reduce<EmbeddingProviderOption[]>((acc, p) => {
      if (used.has(p.providerId)) acc.push({ providerId: p.providerId, providerName: p.providerName });
      return acc;
    }, []);
  }, [embeddingProviderModels, usageRangeData?.usedProviders]);

  // A selection falls back to ALL_FILTER once its provider/model drops out of the active range.
  const providerFilter = availableProviders.some((p) => p.providerId === selectedProvider)
    ? selectedProvider
    : ALL_FILTER;

  const availableModels = React.useMemo<EmbeddingModelOption[]>(() => {
    const usedModels = usageRangeData?.usedModels ?? [];
    return usedModels.reduce<EmbeddingModelOption[]>((acc, m) => {
      if (providerFilter !== ALL_FILTER && m.providerId !== providerFilter) return acc;
      const provider = providerById.get(m.providerId);
      const key = encodeModelFilter(m.providerId, m.modelId);
      const modelName = modelNameByKey.get(key) ?? m.modelId;
      acc.push({
        label: modelName,
        providerId: m.providerId,
        providerName: provider?.providerName ?? m.providerId,
        modelId: m.modelId,
        modelName,
      });
      return acc;
    }, []);
  }, [modelNameByKey, providerById, providerFilter, usageRangeData?.usedModels]);

  const modelFilter = availableModels.some((m) => encodeModelFilter(m.providerId, m.modelId) === selectedModel)
    ? selectedModel
    : ALL_FILTER;

  const usageFilters = React.useMemo(() => {
    const decodedModel = modelFilter === ALL_FILTER ? null : decodeModelFilter(modelFilter);
    const providerIdFromModel = providerFilter === ALL_FILTER ? decodedModel?.providerId : providerFilter;
    return { range: rangeFilter, providerId: providerIdFromModel, modelId: decodedModel?.modelId };
  }, [modelFilter, providerFilter, rangeFilter]);

  const { data: usageData, isFetching } = useQuery({
    ...embeddingUsageDashboardQueryOptions(usageFilters),
    placeholderData: keepPreviousData,
  });

  const providerLabelById = React.useMemo(
    () => new Map(availableProviders.map((p) => [p.providerId, p.providerName] as const)),
    [availableProviders],
  );

  const modelLabelByValue = React.useMemo(
    () =>
      new Map(
        availableModels.map(
          (m) => [encodeModelFilter(m.providerId, m.modelId), `${m.providerName} · ${m.modelName}`] as const,
        ),
      ),
    [availableModels],
  );

  return {
    availableModels,
    availableProviders,
    filters: { provider: providerFilter, model: modelFilter, range: rangeFilter },
    labels: {
      provider: providerFilter === ALL_FILTER ? 'All providers' : (providerLabelById.get(providerFilter) ?? 'Provider'),
      model: modelFilter === ALL_FILTER ? 'All models' : (modelLabelByValue.get(modelFilter) ?? 'Model'),
      range: RANGE_LABELS[rangeFilter],
    },
    isFetching,
    setModelFilter,
    setProviderFilter,
    usageData,
  };
}
