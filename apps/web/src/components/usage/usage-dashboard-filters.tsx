import { USAGE_DATE_RANGES, type UsageDateRange } from '@stitch/shared/usage/types';

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ALL_FILTER,
  encodeModelFilter,
  RANGE_LABELS,
} from '@/components/usage/usage-dashboard-utils';
import type { ModelOption, ProviderOption } from '@/components/usage/use-usage-dashboard-data';

type UsageDashboardFiltersProps = {
  availableModels: ModelOption[];
  availableProviders: ProviderOption[];
  filters: {
    provider: string;
    model: string;
    range: UsageDateRange;
  };
  labels: {
    provider: string;
    model: string;
    range: string;
  };
  isFetching: boolean;
  onModelChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onRangeChange: (value: UsageDateRange) => void;
};

type ModelGroup = {
  value: string;
  items: ModelOption[];
};

const ALL_MODELS_OPTION: ModelOption = {
  label: 'All models',
  providerId: ALL_FILTER,
  providerName: 'All providers',
  modelId: ALL_FILTER,
  modelName: 'All models',
};

function groupModelsByProvider(models: ModelOption[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();

  for (const model of models) {
    const group = groups.get(model.providerId);
    if (group) {
      group.items.push(model);
      continue;
    }

    groups.set(model.providerId, {
      value: model.providerName,
      items: [model],
    });
  }

  return [...groups.values()];
}

function getSelectedModel(models: ModelOption[], value: string): ModelOption | null {
  if (value === ALL_FILTER) return null;
  return (
    models.find((model) => encodeModelFilter(model.providerId, model.modelId) === value) ?? null
  );
}

export function UsageDashboardFilters({
  availableModels,
  availableProviders,
  filters,
  labels,
  isFetching,
  onModelChange,
  onProviderChange,
  onRangeChange,
}: UsageDashboardFiltersProps) {
  const modelGroups = groupModelsByProvider(availableModels);
  const selectedModel = getSelectedModel(availableModels, filters.model);

  function handleModelChange(value: ModelOption | null) {
    if (!value || value === ALL_MODELS_OPTION) {
      onModelChange(ALL_FILTER);
      return;
    }

    onModelChange(encodeModelFilter(value.providerId, value.modelId));
  }

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Select
          value={filters.provider}
          onValueChange={(value) => onProviderChange(value ?? ALL_FILTER)}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="Filter by provider">{labels.provider}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All providers</SelectItem>
            {availableProviders.map((provider) => (
              <SelectItem key={provider.providerId} value={provider.providerId}>
                {provider.providerName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Combobox<ModelOption>
          value={selectedModel}
          onValueChange={handleModelChange}
          isItemEqualToValue={(a, b) => a.providerId === b.providerId && a.modelId === b.modelId}
          items={modelGroups}
        >
          <ComboboxInput
            className="w-full bg-background"
            placeholder={labels.model}
            showClear={filters.model !== ALL_FILTER}
          />
          <ComboboxContent side="bottom" sideOffset={4} align="start">
            <ComboboxEmpty>No models found</ComboboxEmpty>
            <ComboboxList>
              <ComboboxItem value={ALL_MODELS_OPTION}>All models</ComboboxItem>
              {modelGroups.length > 0 ? <ComboboxSeparator /> : null}
              {modelGroups.map((group, index) => (
                <ComboboxGroup key={group.value} items={group.items}>
                  <ComboboxLabel>{group.value}</ComboboxLabel>
                  <ComboboxCollection>
                    {(item) => (
                      <ComboboxItem key={`${item.providerId}:${item.modelId}`} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                  {index < modelGroups.length - 1 && <ComboboxSeparator />}
                </ComboboxGroup>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <div className="flex items-center gap-2">
          <Select value={filters.range} onValueChange={(value) => onRangeChange(value ?? '30d')}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Select date range">{labels.range}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {USAGE_DATE_RANGES.map((range) => (
                <SelectItem key={range} value={range}>
                  {RANGE_LABELS[range]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isFetching ? (
            <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
