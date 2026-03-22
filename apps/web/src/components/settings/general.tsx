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
import { Switch } from '@/components/ui/switch';
import { visibleProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';

type ModelOption = {
  label: string;
  providerId: string;
  modelId: string;
};

type ModelGroup = {
  value: string;
  items: ModelOption[];
};

const MODEL_PREFERENCES = [
  {
    providerIdKey: 'model.default.providerId',
    modelIdKey: 'model.default.modelId',
    label: 'Default Model',
    description: 'Used for general chat and coding tasks',
  },
  {
    providerIdKey: 'model.compaction.providerId',
    modelIdKey: 'model.compaction.modelId',
    label: 'Compaction Model',
    description: 'Used for compacting conversation context',
  },
  {
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    label: 'Title Generation Model',
    description: 'Used for generating conversation titles',
  },
] as const;

function buildGroupedItems(providerModels: ProviderModels[]): ModelGroup[] {
  return providerModels.map((provider) => ({
    value: provider.providerName,
    items: provider.models.map((model) => ({
      label: model.name,
      providerId: provider.providerId,
      modelId: model.id,
    })),
  }));
}

function flattenGroups(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((g) => g.items);
}

function ModelSelect({
  providerIdKey,
  modelIdKey,
  currentProviderId,
  currentModelId,
  providerModels,
}: {
  providerIdKey: string;
  modelIdKey: string;
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  providerModels: ProviderModels[];
}) {
  const queryClient = useQueryClient();

  const groups = React.useMemo(() => buildGroupedItems(providerModels), [providerModels]);
  const allOptions = React.useMemo(() => flattenGroups(groups), [groups]);

  const saveProviderMutation = useMutation(saveSettingMutationOptions(providerIdKey, queryClient));
  const saveModelMutation = useMutation(
    saveSettingMutationOptions(modelIdKey, queryClient, { silent: true }),
  );
  const deleteProviderMutation = useMutation(
    deleteSettingMutationOptions(providerIdKey, queryClient),
  );
  const deleteModelMutation = useMutation(
    deleteSettingMutationOptions(modelIdKey, queryClient, { silent: true }),
  );

  function handleValueChange(value: ModelOption | null) {
    if (!value) {
      if (currentProviderId) deleteProviderMutation.mutate();
      if (currentModelId) deleteModelMutation.mutate();
      return;
    }
    saveProviderMutation.mutate(value.providerId);
    saveModelMutation.mutate(value.modelId);
  }

  const selectedOption =
    currentProviderId && currentModelId
      ? (allOptions.find(
          (o) => o.providerId === currentProviderId && o.modelId === currentModelId,
        ) ?? null)
      : null;

  return (
    <Combobox<ModelOption>
      value={selectedOption}
      onValueChange={handleValueChange}
      isItemEqualToValue={(a, b) => a.providerId === b.providerId && a.modelId === b.modelId}
      items={groups}
    >
      <ComboboxInput
        placeholder="Search models..."
        showClear={!!(currentProviderId && currentModelId)}
      />
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
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);

  if (providerModels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No providers are connected. Configure a provider first to select preferred models.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {MODEL_PREFERENCES.map((pref, index) => (
        <div
          key={pref.providerIdKey}
          className={`flex items-center justify-between gap-4 py-3 ${index < MODEL_PREFERENCES.length - 1 ? 'border-b border-border/50' : ''}`}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label className="text-sm font-medium">{pref.label}</Label>
            <p className="text-xs text-muted-foreground">{pref.description}</p>
          </div>
          <div className="w-52 shrink-0">
            <ModelSelect
              providerIdKey={pref.providerIdKey}
              modelIdKey={pref.modelIdKey}
              currentProviderId={settings[pref.providerIdKey]}
              currentModelId={settings[pref.modelIdKey]}
              providerModels={providerModels}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GeneralSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">Configure models for different tasks</p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Models</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <ModelsContent />
        </React.Suspense>
      </section>
      <section className="mt-8 space-y-3">
        <h3 className="text-sm font-medium">Notifications</h3>
        <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <NotificationsContent />
        </React.Suspense>
      </section>
    </div>
  );
}

function NotificationsContent() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const soundEnabled = settings['notifications.sound.enabled'] !== 'false';

  const saveMutation = useMutation(
    saveSettingMutationOptions('notifications.sound.enabled', queryClient, { silent: true }),
  );

  function handleSoundToggle(checked: boolean) {
    saveMutation.mutate(checked ? 'true' : 'false');
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor="sound-toggle" className="text-sm font-medium">
          Sound alerts
        </Label>
        <p className="text-xs text-muted-foreground">
          Play an attention sound when the AI needs your input
        </p>
      </div>
      <Switch id="sound-toggle" checked={soundEnabled} onCheckedChange={handleSoundToggle} />
    </div>
  );
}
