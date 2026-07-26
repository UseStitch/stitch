import * as React from 'react';

import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { UsageDateRange } from '@stitch/shared/usage/types';

import {
  ALL_FILTER,
  decodeModelFilter,
  encodeModelFilter,
  RANGE_LABELS,
} from '@/components/usage/utils/usage-dashboard-utils';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import { usageDashboardQueryOptions } from '@/lib/queries/usage';

export type ProviderOption = { providerId: string; providerName: string };

export type ModelOption = {
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
};

export function useUsageDashboardData() {
  const { data: providerModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);

  const [selectedProvider, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [selectedModel, setModelFilter] = React.useState<string>(ALL_FILTER);
  const [rangeFilter, setRangeFilter] = React.useState<UsageDateRange>('30d');

  const { data: usageRangeData } = useQuery({
    ...usageDashboardQueryOptions({ range: rangeFilter }),
    placeholderData: keepPreviousData,
  });

  const providerById = new Map(providerModels.map((provider) => [provider.providerId, provider] as const));

  const modelNameByKey = new Map<string, string>();
  for (const provider of providerModels) {
    for (const model of provider.models) {
      modelNameByKey.set(encodeModelFilter(provider.providerId, model.id), model.name);
    }
  }

  const used = new Set(usageRangeData?.usedProviders ?? []);
  const availableProviders: ProviderOption[] = providerModels
    .filter((provider) => used.has(provider.providerId))
    .map((provider) => ({ providerId: provider.providerId, providerName: provider.providerName }));

  // A selection falls back to ALL_FILTER once its provider/model drops out of the active range.
  const providerFilter = availableProviders.some((p) => p.providerId === selectedProvider)
    ? selectedProvider
    : ALL_FILTER;

  const usedModels = usageRangeData?.usedModels ?? [];
  const availableModels: ModelOption[] = usedModels
    .filter((model) => providerFilter === ALL_FILTER || model.providerId === providerFilter)
    .map((model) => {
      const provider = providerById.get(model.providerId);
      const key = encodeModelFilter(model.providerId, model.modelId);
      const modelName = modelNameByKey.get(key) ?? model.modelId;
      return {
        label: modelName,
        providerId: model.providerId,
        providerName: provider?.providerName ?? model.providerId,
        modelId: model.modelId,
        modelName,
      };
    });

  const modelFilter = availableModels.some((m) => encodeModelFilter(m.providerId, m.modelId) === selectedModel)
    ? selectedModel
    : ALL_FILTER;

  const decodedModel = modelFilter === ALL_FILTER ? null : decodeModelFilter(modelFilter);
  const providerIdFromModel = providerFilter === ALL_FILTER ? decodedModel?.providerId : providerFilter;
  const usageFilters = { range: rangeFilter, providerId: providerIdFromModel, modelId: decodedModel?.modelId };

  const { data: usageData, isFetching } = useQuery({
    ...usageDashboardQueryOptions(usageFilters),
    placeholderData: keepPreviousData,
  });

  const providerLabelById = new Map(availableProviders.map((p) => [p.providerId, p.providerName] as const));

  const modelLabelByValue = new Map(
    availableModels.map(
      (model) =>
        [encodeModelFilter(model.providerId, model.modelId), `${model.providerName} · ${model.modelName}`] as const,
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
    setRangeFilter,
    usageData,
  };
}
