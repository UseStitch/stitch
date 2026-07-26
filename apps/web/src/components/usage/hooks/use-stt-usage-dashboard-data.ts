import * as React from 'react';

import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { UsageDateRange } from '@stitch/shared/usage/types';

import {
  ALL_FILTER,
  RANGE_LABELS,
  encodeModelFilter,
  decodeModelFilter,
} from '@/components/usage/utils/usage-dashboard-utils';
import { sttProviderModelsQueryOptions } from '@/lib/queries/providers';
import { sttUsageDashboardQueryOptions } from '@/lib/queries/usage';

type SttProviderOption = { providerId: string; providerName: string };

type SttModelOption = { label: string; providerId: string; providerName: string; modelId: string; modelName: string };

export function useSttUsageDashboardData(rangeFilter: UsageDateRange) {
  const { data: sttProviderModels } = useSuspenseQuery(sttProviderModelsQueryOptions);

  const [selectedProvider, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [selectedModel, setModelFilter] = React.useState<string>(ALL_FILTER);

  const { data: usageRangeData } = useQuery({
    ...sttUsageDashboardQueryOptions({ range: rangeFilter }),
    placeholderData: keepPreviousData,
  });

  const providerById = new Map(sttProviderModels.map((p) => [p.providerId, p] as const));

  const modelNameByKey = new Map<string, string>();
  for (const provider of sttProviderModels) {
    for (const model of provider.models) {
      modelNameByKey.set(encodeModelFilter(provider.providerId, model.id), model.name);
    }
  }

  const used = new Set(usageRangeData?.usedProviders ?? []);
  const availableProviders = sttProviderModels.reduce<SttProviderOption[]>((acc, p) => {
    if (used.has(p.providerId)) acc.push({ providerId: p.providerId, providerName: p.providerName });
    return acc;
  }, []);

  // A selection falls back to ALL_FILTER once its provider/model drops out of the active range.
  const providerFilter = availableProviders.some((p) => p.providerId === selectedProvider)
    ? selectedProvider
    : ALL_FILTER;

  const usedModels = usageRangeData?.usedModels ?? [];
  const availableModels = usedModels.reduce<SttModelOption[]>((acc, m) => {
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

  const modelFilter = availableModels.some((m) => encodeModelFilter(m.providerId, m.modelId) === selectedModel)
    ? selectedModel
    : ALL_FILTER;

  const decodedModel = modelFilter === ALL_FILTER ? null : decodeModelFilter(modelFilter);
  const providerIdFromModel = providerFilter === ALL_FILTER ? decodedModel?.providerId : providerFilter;
  const usageFilters = { range: rangeFilter, providerId: providerIdFromModel, modelId: decodedModel?.modelId };

  const { data: usageData, isFetching } = useQuery({
    ...sttUsageDashboardQueryOptions(usageFilters),
    placeholderData: keepPreviousData,
  });

  const providerLabelById = new Map(availableProviders.map((p) => [p.providerId, p.providerName] as const));

  const modelLabelByValue = new Map(
    availableModels.map(
      (m) => [encodeModelFilter(m.providerId, m.modelId), `${m.providerName} · ${m.modelName}`] as const,
    ),
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
