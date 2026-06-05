import { CpuIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { buildDefaultVisibleSet, isModelVisible } from '@stitch/shared/providers/model-visibility';

import { SettingPage } from '@/components/settings/settings-ui';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  modelVisibilityQueryOptions,
  useResetModelVisibility,
  useSetModelVisibility,
} from '@/lib/queries/model-visibility';
import { enabledProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';

type ModelRowProps = {
  modelName: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
};

function ModelRow({ modelName, checked, onToggle }: ModelRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-3 last:border-none">
      <span className="truncate text-sm text-foreground">{modelName}</span>
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

  const overridesMap = React.useMemo(
    () => new Map(overridesList.map((o) => [`${o.providerId}:${o.modelId}`, o.visibility])),
    [overridesList],
  );

  const defaultVisibleSet = React.useMemo(
    () =>
      buildDefaultVisibleSet(
        allProviderModels.map((p) => ({
          providerId: p.providerId,
          models: p.models.map((m) => ({
            id: m.id,
            family: m.family,
            release_date: m.release_date,
          })),
        })),
      ),
    [allProviderModels],
  );

  const selectedProviderModels = React.useMemo(() => {
    if (selectedProviderId === 'all') return allProviderModels;
    return allProviderModels.filter((provider) => provider.providerId === selectedProviderId);
  }, [allProviderModels, selectedProviderId]);

  const selectedProvider = React.useMemo(
    () => allProviderModels.find((provider) => provider.providerId === selectedProviderId),
    [allProviderModels, selectedProviderId],
  );

  const filtered = React.useMemo(() => {
    if (!search.trim()) return selectedProviderModels;
    const q = search.toLowerCase();
    return selectedProviderModels
      .map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) || provider.providerName.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [search, selectedProviderModels]);

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
      toast.error(error instanceof Error ? error.message : 'Failed to update model visibility');
    }
  }

  if (allProviderModels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No providers are connected. Configure a provider first to manage model visibility.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={selectedProviderId}
          onValueChange={(value) => setSelectedProviderId(value ?? 'all')}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
              {selectedProviderId === 'all'
                ? 'All'
                : (selectedProvider?.providerName ?? 'Select provider')}
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
        <p className="py-4 text-center text-sm text-muted-foreground">
          No models match your search.
        </p>
      )}

      {filtered.map((provider) => (
        <div key={provider.providerId}>
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {provider.providerName}
          </p>
          <div>
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                modelName={model.name}
                checked={isModelVisible(
                  provider.providerId,
                  model.id,
                  overridesMap,
                  defaultVisibleSet,
                )}
                onToggle={(checked) => void handleToggle(provider, model.id, checked)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModelsSettings() {
  return (
    <SettingPage
      title="Models"
      description="Choose which models appear in the model selector"
      icon={<CpuIcon className="size-5" />}
    >
      <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <ModelsListContent />
      </React.Suspense>
    </SettingPage>
  );
}
