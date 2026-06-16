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

type SttProviderOption = {
  providerId: string;
  providerName: string;
};

type SttModelOption = {
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
};

export function useSttUsageDashboardData(rangeFilter: UsageDateRange) {
  const { data: sttProviderModels } = useSuspenseQuery(sttProviderModelsQueryOptions);

  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [modelFilter, setModelFilter] = React.useState<string>(ALL_FILTER);

  const { data: usageRangeData } = useQuery({
    ...sttUsageDashboardQueryOptions({ range: rangeFilter }),
    placeholderData: keepPreviousData,
  });

  const providerById = React.useMemo(
    () => new Map(sttProviderModels.map((p) => [p.providerId, p] as const)),
    [sttProviderModels],
  );

  const modelNameByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of sttProviderModels) {
      for (const model of provider.models) {
        map.set(encodeModelFilter(provider.providerId, model.id), model.name);
      }
    }
    return map;
  }, [sttProviderModels]);

  const availableProviders = React.useMemo<SttProviderOption[]>(() => {
    const used = new Set(usageRangeData?.usedProviders ?? []);
    return sttProviderModels
      .filter((p) => used.has(p.providerId))
      .map((p) => ({ providerId: p.providerId, providerName: p.providerName }));
  }, [sttProviderModels, usageRangeData?.usedProviders]);

  const availableModels = React.useMemo<SttModelOption[]>(() => {
    const usedModels = usageRangeData?.usedModels ?? [];
    return usedModels
      .filter((m) => providerFilter === ALL_FILTER || m.providerId === providerFilter)
      .map((m) => {
        const provider = providerById.get(m.providerId);
        const key = encodeModelFilter(m.providerId, m.modelId);
        const modelName = modelNameByKey.get(key) ?? m.modelId;
        return {
          label: modelName,
          providerId: m.providerId,
          providerName: provider?.providerName ?? m.providerId,
          modelId: m.modelId,
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
    ...sttUsageDashboardQueryOptions(usageFilters),
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
          (m) =>
            [
              encodeModelFilter(m.providerId, m.modelId),
              `${m.providerName} · ${m.modelName}`,
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
    usageData,
  };
}
