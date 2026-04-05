import * as React from 'react';

import { LoaderIcon } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  visibleProviderModelsQueryOptions,
  type ProviderModels,
} from '@/lib/queries/providers';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';
import { useUpdaterStore } from '@/stores/updater-store';

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
    description: 'Used for general conversations and everyday assistance tasks',
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
        <h3 className="text-sm font-medium">App Updates</h3>
        <AppUpdatesContent />
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

function updaterStatusLabel(status: string, progress?: number): string {
  if (status === 'checking') return 'Checking for updates...';
  if (status === 'available') return 'Update available. Downloading in background...';
  if (status === 'downloading') return `Downloading update${progress ? ` (${Math.round(progress)}%)` : '...'}`;
  if (status === 'downloaded') return 'Update ready. Restart Stitch to install.';
  if (status === 'no-update') return 'You are up to date.';
  if (status === 'error') return 'Could not check for updates.';
  if (status === 'installing') return 'Installing update and restarting...';
  return 'Check for updates manually.';
}

function AppUpdatesContent() {
  const updater = useUpdaterStore((state) => state.updater);
  const setInstalling = useUpdaterStore((state) => state.setInstalling);
  const [checkPending, setCheckPending] = React.useState(false);
  const [installPending, setInstallPending] = React.useState(false);

  const statusText = updaterStatusLabel(updater.status, updater.progress);
  const actionPending = checkPending || installPending;
  const canCheck = updater.status !== 'checking' && updater.status !== 'downloading' && !actionPending;
  const canInstall = updater.status === 'downloaded' && !actionPending;

  function handleCheckUpdates() {
    setCheckPending(true);
    const startedAt = Date.now();
    void window.api?.updater?.check().finally(() => {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, 700 - elapsedMs);
      window.setTimeout(() => setCheckPending(false), remainingMs);
    });
  }

  function handleInstallUpdate() {
    setInstallPending(true);
    setInstalling();
    void window.api?.updater
      ?.install()
      .finally(() => {
        setInstallPending(false);
      });
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label className="text-sm font-medium">Desktop app updates</Label>
        <p className="text-xs text-muted-foreground">{statusText}</p>
        {updater.error ? <p className="text-xs text-destructive">{updater.error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCheckUpdates} disabled={!canCheck}>
          {checkPending ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              Checking...
            </>
          ) : (
            'Check for updates'
          )}
        </Button>
        {canInstall ? (
          <Button type="button" size="sm" onClick={handleInstallUpdate}>
            Restart to update
          </Button>
        ) : null}
      </div>
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
