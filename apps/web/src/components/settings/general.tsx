import { LoaderIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { SettingsModelSelect } from '@/components/settings/model-select';
import { SwitchSettingRow } from '@/components/settings/setting-rows';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
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

function ModelsContent() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);

  return (
    <div className="flex flex-col">
      {providerModels.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          No providers are connected. Configure a provider first to select preferred models.
        </p>
      ) : (
        MODEL_PREFERENCES.map((pref, index) => (
          <div
            key={pref.providerIdKey}
            className={`flex items-center justify-between gap-4 py-3 ${index < MODEL_PREFERENCES.length - 1 ? 'border-b border-border/50' : ''}`}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label className="text-sm font-medium">{pref.label}</Label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <div className="w-52 shrink-0">
              <SettingsModelSelect
                providerIdKey={pref.providerIdKey}
                modelIdKey={pref.modelIdKey}
                currentProviderId={settings[pref.providerIdKey]}
                currentModelId={settings[pref.modelIdKey]}
                providerModels={providerModels}
              />
            </div>
          </div>
        ))
      )}
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
  if (status === 'downloading')
    return `Downloading update${progress ? ` (${Math.round(progress)}%)` : '...'}`;
  if (status === 'downloaded') return 'Update ready. Restart Stitch to install.';
  if (status === 'no-update') return 'You are up to date.';
  if (status === 'error') return 'Could not check for updates.';
  if (status === 'installing') return 'Installing update and restarting...';
  return 'Check for updates manually.';
}

const RELEASES_URL = 'https://github.com/UseStitch/stitch/releases/latest';

function AppUpdatesContent() {
  const isMac = window.electron?.platform === 'darwin';

  if (isMac) {
    return (
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">Desktop app updates</Label>
          <p className="text-xs text-muted-foreground">
            Auto-updates are not available on macOS. Download the latest version from the releases
            page.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void window.api?.shell?.openExternal(RELEASES_URL)}
        >
          Download update
        </Button>
      </div>
    );
  }

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
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label className="text-sm font-medium">Desktop app updates</Label>
        <p className="text-xs text-muted-foreground">{statusText}</p>
        {updater.error ? <p className="text-xs text-destructive">{updater.error}</p> : null}
      </div>
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
    </div>
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
      borderBottom={false}
    />
  );
}
