import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import {
  buildDefaultVisibleSet,
  isModelVisible,
} from '@stitch/shared/providers/model-visibility';

import { Input } from '@/components/ui/input';
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
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50 last:border-none">
      <span className="text-sm text-foreground truncate">{modelName}</span>
      <Switch
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${modelName}`}
      />
    </div>
  );
}

function ModelsListContent() {
  const { data: allProviderModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);
  const { data: overridesList } = useSuspenseQuery(modelVisibilityQueryOptions);

  const setVisibility = useSetModelVisibility();
  const resetVisibility = useResetModelVisibility();

  const [search, setSearch] = React.useState('');

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

  const filtered = React.useMemo(() => {
    if (!search.trim()) return allProviderModels;
    const q = search.toLowerCase();
    return allProviderModels
      .map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            provider.providerName.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [allProviderModels, search]);

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
      {/* Search */}
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search models..."
      />

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No models match your search.</p>
      )}

      {filtered.map((provider) => (
        <div key={provider.providerId}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {provider.providerName}
          </p>
          <div className="rounded-lg border border-border/60 overflow-hidden px-3">
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                modelName={model.name}
                checked={isModelVisible(provider.providerId, model.id, overridesMap, defaultVisibleSet)}
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
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-base font-bold">Models</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which models appear in the model selector
        </p>
      </div>
      <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <ModelsListContent />
      </React.Suspense>
    </div>
  );
}
