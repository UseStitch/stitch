import * as React from 'react';

import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { UsageDateRange } from '@stitch/shared/usage/types';

import {
  ALL_FILTER,
  decodeModelFilter,
  encodeModelFilter,
  RANGE_LABELS,
} from '@/components/usage/usage-dashboard-utils';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import { usageDashboardQueryOptions } from '@/lib/queries/usage';

export type ProviderOption = {
  providerId: string;
  providerName: string;
};

export type ModelOption = {
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
};

export function useUsageDashboardData() {
  const { data: providerModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);

  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [modelFilter, setModelFilter] = React.useState<string>(ALL_FILTER);
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
    return providerModels
      .filter((provider) => used.has(provider.providerId))
      .map((provider) => ({
        providerId: provider.providerId,
        providerName: provider.providerName,
      }));
  }, [providerModels, usageRangeData?.usedProviders]);

  const availableModels = React.useMemo<ModelOption[]>(() => {
    const usedModels = usageRangeData?.usedModels ?? [];
    return usedModels
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
  }, [modelNameByKey, providerById, providerFilter, usageRangeData?.usedModels]);

  React.useEffect(() => {
    if (providerFilter === ALL_FILTER) return;
    const stillAvailable = availableProviders.some((p) => p.providerId === providerFilter);
    if (!stillAvailable) {
      setProviderFilter(ALL_FILTER);
      setModelFilter(ALL_FILTER);
    }
  }, [availableProviders, providerFilter]);

  React.useEffect(() => {
    if (modelFilter === ALL_FILTER) return;
    const isStillAvailable = availableModels.some(
      (m) => encodeModelFilter(m.providerId, m.modelId) === modelFilter,
    );
    if (!isStillAvailable) setModelFilter(ALL_FILTER);
  }, [availableModels, modelFilter]);

  const usageFilters = React.useMemo(() => {
    const decodedModel = modelFilter === ALL_FILTER ? null : decodeModelFilter(modelFilter);
    const providerIdFromModel =
      providerFilter === ALL_FILTER ? decodedModel?.providerId : providerFilter;
    return {
      range: rangeFilter,
      providerId: providerIdFromModel,
      modelId: decodedModel?.modelId,
    };
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
            [
              encodeModelFilter(model.providerId, model.modelId),
              `${model.providerName} · ${model.modelName}`,
            ] as const,
        ),
      ),
    [availableModels],
  );

  return {
    availableModels,
    availableProviders,
    filters: {
      provider: providerFilter,
      model: modelFilter,
      range: rangeFilter,
    },
    labels: {
      provider:
        providerFilter === ALL_FILTER
          ? 'All providers'
          : (providerLabelById.get(providerFilter) ?? 'Provider'),
      model:
        modelFilter === ALL_FILTER ? 'All models' : (modelLabelByValue.get(modelFilter) ?? 'Model'),
      range: RANGE_LABELS[rangeFilter],
    },
    isFetching,
    setModelFilter,
    setProviderFilter,
    setRangeFilter,
    usageData,
  };
}
