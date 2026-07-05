import * as React from 'react';

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

export type ModelSelection = { providerId: string; modelId: string };

type MinimalProviderModels = { providerId: string; providerName: string; models: { id: string; name: string }[] };

type ModelOption = { label: string; providerId: string; providerName: string; modelId: string };

type ModelGroup = { value: string; items: ModelOption[] };

function buildGroups(providerModels: MinimalProviderModels[]): ModelGroup[] {
  return providerModels.map((provider) => ({
    value: provider.providerName,
    items: provider.models.map((model) => ({
      label: model.name,
      providerId: provider.providerId,
      providerName: provider.providerName,
      modelId: model.id,
    })),
  }));
}

function flattenGroups(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((g) => g.items);
}

type ModelComboboxProps = {
  providerModels: MinimalProviderModels[];
  value: ModelSelection | null;
  onValueChange: (value: ModelSelection | null) => void;
  placeholder?: string;
  showClear?: boolean;
};

export function ModelCombobox({
  providerModels,
  value,
  onValueChange,
  placeholder = 'Search models...',
  showClear,
}: ModelComboboxProps) {
  const groups = React.useMemo(() => buildGroups(providerModels), [providerModels]);
  const allOptions = React.useMemo(() => flattenGroups(groups), [groups]);

  const selectedOption = value
    ? (allOptions.find((o) => o.providerId === value.providerId && o.modelId === value.modelId) ?? null)
    : null;

  const resolvedShowClear = showClear ?? !!value;

  function handleValueChange(option: ModelOption | null) {
    if (!option) {
      onValueChange(null);
      return;
    }
    onValueChange({ providerId: option.providerId, modelId: option.modelId });
  }

  return (
    <Combobox<ModelOption>
      value={selectedOption}
      onValueChange={handleValueChange}
      isItemEqualToValue={(a, b) => a.providerId === b.providerId && a.modelId === b.modelId}
      items={groups}>
      <ComboboxInput placeholder={placeholder} showClear={resolvedShowClear} />
      <ComboboxContent side="bottom" sideOffset={4} align="start">
        <ComboboxEmpty>No models found</ComboboxEmpty>
        <ComboboxList>
          {(group, index) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ComboboxItem key={`${item.providerId}:${item.modelId}`} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {index < groups.length - 1 && <ComboboxSeparator />}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
