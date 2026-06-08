import { LoaderIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SettingsModelSelect } from '@/components/settings/model-select';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
  SwitchSettingRow,
} from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  sttProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import {
  deleteSettingMutationOptions,
  saveSettingMutationOptions,
  settingsQueryOptions,
} from '@/lib/queries/settings';
import { useUpdaterStore } from '@/stores/updater-store';

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

function SttModelSelect() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);

  const saveProviderMutation = useMutation(
    saveSettingMutationOptions('stt.default.providerId', queryClient, { silent: true }),
  );
  const saveModelMutation = useMutation(
    saveSettingMutationOptions('stt.default.modelId', queryClient),
  );
  const deleteProviderMutation = useMutation(
    deleteSettingMutationOptions('stt.default.providerId', queryClient, { silent: true }),
  );
  const deleteModelMutation = useMutation(
    deleteSettingMutationOptions('stt.default.modelId', queryClient, { silent: true }),
  );

  const currentProviderId = settings['stt.default.providerId'];
  const currentModelId = settings['stt.default.modelId'];
  const selectedValue =
    currentProviderId && currentModelId ? `${currentProviderId}:${currentModelId}` : '';

  const selectedLabel = React.useMemo(() => {
    if (!currentProviderId || !currentModelId) return null;
    const provider = sttProviders.find((p) => p.providerId === currentProviderId);
    return provider?.models.find((m) => m.modelId === currentModelId)?.displayName ?? null;
  }, [sttProviders, currentProviderId, currentModelId]);

  function handleChange(value: string | null) {
    if (!value) {
      deleteProviderMutation.mutate();
      deleteModelMutation.mutate();
      return;
    }
    const [providerId, modelId] = value.split(':') as [string, string];
    saveProviderMutation.mutate(providerId);
    saveModelMutation.mutate(modelId);
  }

  if (sttProviders.length === 0) {
    return (
      <p className="py-1 text-sm text-muted-foreground">
        No STT providers configured. Add OpenAI, ElevenLabs, or Google credentials first.
      </p>
    );
  }

  return (
    <Select value={selectedValue} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select STT model...">{selectedLabel ?? undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {sttProviders.map((provider) => (
          <SelectGroup key={provider.providerId}>
            <SelectLabel>{provider.providerId}</SelectLabel>
            {provider.models.map((model) => (
              <SelectItem
                key={`${provider.providerId}:${model.modelId}`}
                value={`${provider.providerId}:${model.modelId}`}
              >
                {model.displayName}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModelsContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);

  if (providerModels.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        No providers are connected. Configure a provider first to select preferred models.
      </p>
    );
  }

  return (
    <SettingRows>
      {MODEL_PREFERENCES.map((pref) => (
        <SettingRow key={pref.providerIdKey} label={pref.label} description={pref.description}>
          <SettingRowControl>
            <SettingsModelSelect
              providerIdKey={pref.providerIdKey}
              modelIdKey={pref.modelIdKey}
              currentProviderId={settings[pref.providerIdKey]}
              currentModelId={settings[pref.modelIdKey]}
              providerModels={providerModels}
            />
          </SettingRowControl>
        </SettingRow>
      ))}
      <SettingRow label="STT Model" description="Used for live speech-to-text in the chat input">
        <SettingRowControl>
          <SttModelSelect />
        </SettingRowControl>
      </SettingRow>
    </SettingRows>
  );
}

export function GeneralSettings() {
  const page = SETTINGS_PAGE_BY_ID.general;
  const Icon = page.icon;

  return (
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <SettingSection title="Models">
        <ModelsContent />
      </SettingSection>
      <SettingSection title="App Updates">
        <AppUpdatesContent />
      </SettingSection>
      <SettingSection title="Notifications">
        <NotificationsContent />
      </SettingSection>
    </SettingPage>
  );
}

const UPDATER_STATUS_LABELS: Record<string, string> = {
  checking: 'Checking for updates...',
  available: 'Update available. Downloading in background...',
  downloaded: 'Update ready. Restart Stitch to install.',
  'no-update': 'You are up to date.',
  error: 'Could not check for updates.',
  installing: 'Installing update and restarting...',
};

const MAC_MANUAL_UPDATE_DESCRIPTION =
  'Download the latest macOS installer, open it, then quit Stitch so you can replace the app safely.';

function updaterStatusLabel(status: string, progress?: number): string {
  if (status === 'downloading') {
    return `Downloading update${progress ? ` (${Math.round(progress)}%)` : '...'}`;
  }
  return UPDATER_STATUS_LABELS[status] ?? 'Check for updates manually.';
}

function AppUpdatesContent() {
  const isMac = window.electron?.platform === 'darwin';

  if (isMac) {
    return <MacManualUpdatesContent />;
  }

  return <AutoUpdatesContent />;
}

function MacManualUpdatesContent() {
  const [quitPending, setQuitPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleManualUpdate() {
    const openManualUpdateAndQuit = window.api?.updater?.openManualUpdateAndQuit;
    if (!openManualUpdateAndQuit) return;

    setQuitPending(true);
    setError(null);
    try {
      await openManualUpdateAndQuit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setQuitPending(false);
    }
  }

  return (
    <SettingRows>
      <SettingRow label="Desktop app updates" description={MAC_MANUAL_UPDATE_DESCRIPTION}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={handleManualUpdate}
          disabled={quitPending}
        >
          {quitPending ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              Downloading...
            </>
          ) : (
            'Download and quit'
          )}
        </Button>
      </SettingRow>
      {error ? <p className="pb-2 text-xs text-destructive">{error}</p> : null}
    </SettingRows>
  );
}

function AutoUpdatesContent() {
  const updater = useUpdaterStore((state) => state.updater);
  const setInstalling = useUpdaterStore((state) => state.setInstalling);
  const [checkPending, setCheckPending] = React.useState(false);
  const [installPending, setInstallPending] = React.useState(false);

  const statusText = updaterStatusLabel(updater.status, updater.progress);
  const actionPending = checkPending || installPending;
  const canCheck =
    updater.status !== 'checking' && updater.status !== 'downloading' && !actionPending;
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
    void window.api?.updater?.install().finally(() => {
      setInstallPending(false);
    });
  }

  return (
    <SettingRows>
      <SettingRow label="Desktop app updates" description={statusText}>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={!canCheck}
          >
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
      </SettingRow>
      {updater.error ? <p className="pb-2 text-xs text-destructive">{updater.error}</p> : null}
    </SettingRows>
  );
}

function NotificationsContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  return (
    <SwitchSettingRow
      settingKey="notifications.sound.enabled"
      label="Sound alerts"
      description="Play an attention sound when the AI needs your input"
      checked={settings['notifications.sound.enabled'] !== 'false'}
    />
  );
}
