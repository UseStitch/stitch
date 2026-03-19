import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

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
import { Label } from '@/components/ui/label';
import { enabledProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';

const SEPARATOR = ':::';

type ModelOption = {
  value: string;
  label: string;
};

type ModelGroup = {
  value: string;
  items: ModelOption[];
};

const MODEL_PREFERENCES = [
  {
    key: 'model.default',
    label: 'Default Model',
    description: 'Used for general chat and coding tasks',
  },
  {
    key: 'model.compaction',
    label: 'Compaction Model',
    description: 'Used for compacting conversation context',
  },
  {
    key: 'model.title',
    label: 'Title Generation Model',
    description: 'Used for generating conversation titles',
  },
] as const;

function buildGroupedItems(providerModels: ProviderModels[]): ModelGroup[] {
  return providerModels.map((provider) => ({
    value: provider.providerName,
    items: provider.models.map((model) => ({
      value: `${provider.providerId}${SEPARATOR}${model.id}`,
      label: model.name,
    })),
  }));
}

function flattenGroups(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((g) => g.items);
}

function ModelSelect({
  settingKey,
  currentValue,
  providerModels,
}: {
  settingKey: string;
  currentValue: string | undefined;
  providerModels: ProviderModels[];
}) {
  const queryClient = useQueryClient();

  const groups = React.useMemo(() => buildGroupedItems(providerModels), [providerModels]);
  const allOptions = React.useMemo(() => flattenGroups(groups), [groups]);

  const saveMutation = useMutation(saveSettingMutationOptions(settingKey, queryClient));
  const deleteMutation = useMutation(deleteSettingMutationOptions(settingKey, queryClient));

  function handleValueChange(value: ModelOption | null) {
    if (!value) {
      if (currentValue) deleteMutation.mutate();
      return;
    }
    saveMutation.mutate(value.value);
  }

  const selectedOption = currentValue
    ? (allOptions.find((o) => o.value === currentValue) ?? null)
    : null;

  return (
    <Combobox<ModelOption>
      value={selectedOption}
      onValueChange={handleValueChange}
      isItemEqualToValue={(a, b) => a.value === b.value}
      items={groups}
    >
      <ComboboxInput placeholder="Search models..." showClear={!!currentValue} />
      <ComboboxContent side="bottom" sideOffset={4} align="start">
        <ComboboxEmpty>No models found</ComboboxEmpty>
        <ComboboxList>
          {(group, index) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ComboboxItem key={item.value} value={item}>
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

function ModelsContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);

  if (providerModels.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No providers are connected. Configure a provider first to select preferred models.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {MODEL_PREFERENCES.map((pref) => (
        <div key={pref.key} className="flex flex-col gap-1.5">
          <Label>{pref.label}</Label>
          <p className="text-muted-foreground text-xs mb-1">{pref.description}</p>
          <ModelSelect
            settingKey={pref.key}
            currentValue={settings[pref.key]}
            providerModels={providerModels}
          />
        </div>
      ))}
    </div>
  );
}

export function GeneralSettings() {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-base font-bold">General</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure models for different tasks</p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Models</h3>
        <React.Suspense fallback={<div className="text-muted-foreground text-sm">Loading...</div>}>
          <ModelsContent />
        </React.Suspense>
      </section>
    </div>
  );
}
