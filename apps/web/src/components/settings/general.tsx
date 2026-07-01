import { LoaderIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { ModelCombobox, type ModelSelection } from '@/components/model-selectors/model-combobox';
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
import { ButtonGroup } from '@/components/ui/button-group';
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
    saveSettingMutationOptions('stt.default.modelId', queryClient, {
      successMessage: 'STT model saved',
    }),
  );
  const deleteProviderMutation = useMutation(
    deleteSettingMutationOptions('stt.default.providerId', queryClient, { silent: true }),
  );
  const deleteModelMutation = useMutation(
    deleteSettingMutationOptions('stt.default.modelId', queryClient, { silent: true }),
  );

  const currentProviderId = settings['stt.default.providerId'];
  const currentModelId = settings['stt.default.modelId'];
  const value: ModelSelection | null =
    currentProviderId && currentModelId
      ? { providerId: currentProviderId, modelId: currentModelId }
      : null;

  function handleValueChange(selection: ModelSelection | null) {
    if (!selection) {
      deleteProviderMutation.mutate();
      deleteModelMutation.mutate();
      return;
    }
    saveProviderMutation.mutate(selection.providerId);
    saveModelMutation.mutate(selection.modelId);
  }

  if (sttProviders.length === 0) {
    return (
      <p className="py-1 text-sm text-muted-foreground">
        No STT providers configured. Add OpenAI, ElevenLabs, or Google credentials first.
      </p>
    );
  }

  return (
    <ModelCombobox
      providerModels={sttProviders}
      value={value}
      onValueChange={handleValueChange}
      placeholder="Select STT model..."
    />
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
      <SettingSection title="Preferred LLMs">
        <ModelsContent />
      </SettingSection>
      <SettingSection title="Dictation">
        <DictationContent />
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

function updaterStatusLabel(status: string, progress?: number): string {
  if (status === 'downloading') {
    return `Downloading update${progress ? ` (${Math.round(progress)}%)` : '...'}`;
  }
  return UPDATER_STATUS_LABELS[status] ?? 'Check for updates manually.';
}

function AppUpdatesContent() {
  return <AutoUpdatesContent />;
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
        <ButtonGroup className="shrink-0">
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
        </ButtonGroup>
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

function DictationContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  return (
    <SettingRows>
      <SettingRow label="STT Model" description="Used for live speech-to-text in the chat input">
        <SettingRowControl>
          <SttModelSelect />
        </SettingRowControl>
      </SettingRow>
      <SwitchSettingRow
        settingKey="stt.holdToTalk"
        label="Hold to talk"
        description="Record only while the dictation shortcut is held, finalizing on release. When off, the shortcut toggles recording on and off."
        checked={settings['stt.holdToTalk'] === 'true'}
      />
    </SettingRows>
  );
}
