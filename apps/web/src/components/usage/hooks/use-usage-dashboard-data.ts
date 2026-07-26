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

  const providerById = React.useMemo(
    () => new Map(providerModels.map((provider) => [provider.providerId, provider] as const)),
    [providerModels],
  );

  const modelNameByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providerModels) {
      for (const model of provider.models) {
        map.set(encodeModelFilter(provider.providerId, model.id), model.name);
      }
    }
    return map;
  }, [providerModels]);

  const availableProviders = React.useMemo<ProviderOption[]>(() => {
    const used = new Set(usageRangeData?.usedProviders ?? []);
    return providerModels.reduce<ProviderOption[]>((acc, provider) => {
      if (used.has(provider.providerId)) {
        acc.push({ providerId: provider.providerId, providerName: provider.providerName });
      }
      return acc;
    }, []);
  }, [providerModels, usageRangeData?.usedProviders]);

  // A selection falls back to ALL_FILTER once its provider/model drops out of the active range.
  const providerFilter = availableProviders.some((p) => p.providerId === selectedProvider)
    ? selectedProvider
    : ALL_FILTER;

  const availableModels = React.useMemo<ModelOption[]>(() => {
    const usedModels = usageRangeData?.usedModels ?? [];
    return usedModels.reduce<ModelOption[]>((acc, model) => {
      if (providerFilter !== ALL_FILTER && model.providerId !== providerFilter) return acc;
      const provider = providerById.get(model.providerId);
      const key = encodeModelFilter(model.providerId, model.modelId);
      const modelName = modelNameByKey.get(key) ?? model.modelId;
      acc.push({
        label: modelName,
        providerId: model.providerId,
        providerName: provider?.providerName ?? model.providerId,
        modelId: model.modelId,
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
    ...usageDashboardQueryOptions(usageFilters),
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
          (model) =>
            [encodeModelFilter(model.providerId, model.modelId), `${model.providerName} · ${model.modelName}`] as const,
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
    setRangeFilter,
    usageData,
  };
}
