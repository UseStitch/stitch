import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { buildDefaultVisibleSet, isModelVisible } from '@stitch/shared/providers/model-visibility';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection, SettingRows } from '@/components/settings/settings-ui';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import {
  modelVisibilityQueryOptions,
  useResetModelVisibility,
  useSetModelVisibility,
} from '@/lib/queries/model-visibility';
import { enabledProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';

type ModelRowProps = { modelName: string; checked: boolean; onToggle: (checked: boolean) => void };

function ModelRow({ modelName, checked, onToggle }: ModelRowProps) {
  return (
    <div className="flex items-center justify-between gap-space-xl py-space-l">
      <Text as="span" variant="body-strong" truncate>
        {modelName}
      </Text>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle ${modelName}`} />
    </div>
  );
}

function ModelsListContent() {
  const { data: allProviderModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);
  const { data: overridesList } = useSuspenseQuery(modelVisibilityQueryOptions);

  const setVisibility = useSetModelVisibility();
  const resetVisibility = useResetModelVisibility();

  const [search, setSearch] = React.useState('');
  const [selectedProviderId, setSelectedProviderId] = React.useState('all');

  const overridesMap = new Map(overridesList.map((o) => [`${o.providerId}:${o.modelId}`, o.visibility]));

  const defaultVisibleSet = buildDefaultVisibleSet(
    allProviderModels.map((p) => ({
      providerId: p.providerId,
      models: p.models.map((m) => ({ id: m.id, family: m.family, release_date: m.release_date })),
    })),
  );

  const selectedProviderModels =
    selectedProviderId === 'all'
      ? allProviderModels
      : allProviderModels.filter((provider) => provider.providerId === selectedProviderId);

  const selectedProvider = allProviderModels.find((provider) => provider.providerId === selectedProviderId);

  const q = search.toLowerCase();
  const filtered = !search.trim()
    ? selectedProviderModels
    : selectedProviderModels.reduce<typeof selectedProviderModels>((acc, provider) => {
        const models = provider.models.filter(
          (m) => m.name.toLowerCase().includes(q) || provider.providerName.toLowerCase().includes(q),
        );
        if (models.length > 0) acc.push({ ...provider, models });
        return acc;
      }, []);

  async function handleToggle(provider: ProviderModels, modelId: string, checked: boolean) {
    const key = `${provider.providerId}:${modelId}`;
    const isDefault = defaultVisibleSet.has(key);
    const wouldMatchDefault = checked === isDefault;

    try {
      if (wouldMatchDefault) {
        // Removing the override restores the default behaviour
        await resetVisibility.mutateAsync({ providerId: provider.providerId, modelId });
      } else {
        await setVisibility.mutateAsync({
          providerId: provider.providerId,
          modelId,
          visibility: checked ? 'show' : 'hide',
        });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update model visibility'), { id: 'model-visibility' });
    }
  }

  if (allProviderModels.length === 0) {
    return <Text tone="muted">No providers are connected. Configure a provider first to manage model visibility.</Text>;
  }

  return (
    <Stack gap="2xl">
      <div className="flex flex-col gap-space-l sm:flex-row sm:items-center">
        <Select value={selectedProviderId} onValueChange={(value) => setSelectedProviderId(value ?? 'all')}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
              {selectedProviderId === 'all' ? 'All' : (selectedProvider?.providerName ?? 'Select provider')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All</SelectItem>
            {allProviderModels.map((provider) => (
              <SelectItem key={provider.providerId} value={provider.providerId}>
                {provider.providerName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models..."
          className="w-full"
        />
      </div>

      {filtered.length === 0 && (
        <div className="py-space-xl text-center">
          <Text tone="muted">No models match your search.</Text>
        </div>
      )}

      {filtered.map((provider) => (
        <SettingSection key={provider.providerId} title={provider.providerName}>
          <SettingRows>
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                modelName={model.name}
                checked={isModelVisible(provider.providerId, model.id, overridesMap, defaultVisibleSet)}
                onToggle={(checked) => void handleToggle(provider, model.id, checked)}
              />
            ))}
          </SettingRows>
        </SettingSection>
      ))}
    </Stack>
  );
}

export function ModelsSettings() {
  const page = SETTINGS_PAGE_BY_ID.models;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <ModelsListContent />
    </SettingPage>
  );
}
