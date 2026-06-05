import { CheckCircleIcon, DownloadIcon, FolderIcon, LoaderIcon, UserIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import {
  SettingLoading,
  SettingPage,
  SettingRow,
  SettingRows,
  SettingSection,
} from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { chromeProfilesQueryOptions, importProfileMutationOptions } from '@/lib/queries/browser';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import { toolEnabledStatesQueryOptions, useSetToolEnabledState } from '@/lib/queries/tools';
import { cn } from '@/lib/utils';

const BROWSER_TOOLSET_ID = 'browser';

function formatImportedLabel(raw: string): string {
  const separator = ' — ';
  const idx = raw.lastIndexOf(separator);
  if (idx === -1) return raw;

  const label = raw.slice(0, idx);
  const iso = raw.slice(idx + separator.length);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `${label} — ${formatted}`;
}

function ProfileStatus() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const imported = settings['browser.profileImported'];
  const activeProfile = settings['browser.activeProfile'];

  if (!imported || imported === 'skipped') {
    return (
      <p className="text-sm text-muted-foreground">
        No Chrome profile has been imported. The browser uses a clean profile.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircleIcon className="size-4 text-success" />
        <span className="text-foreground">Imported: {formatImportedLabel(imported)}</span>
      </div>
      {activeProfile ? (
        <div className="flex items-center gap-2 text-sm">
          <FolderIcon className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">{activeProfile}</span>
        </div>
      ) : null}
    </div>
  );
}

function ProfileList({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const { data: profiles } = useSuspenseQuery(chromeProfilesQueryOptions);
  const importMutation = useMutation(importProfileMutationOptions(queryClient));

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Chrome profiles found. Make sure Google Chrome is installed and has been used at least
        once.
      </p>
    );
  }

  return (
    <>
      <SettingRows>
        {profiles.map((profile) => (
          <div key={profile.id} className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                <UserIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label className="text-sm font-medium">{profile.name}</Label>
                <p className="text-xs text-muted-foreground">{profile.email ?? profile.id}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || importMutation.isPending}
              onClick={() => importMutation.mutate(profile.id)}
            >
              {importMutation.isPending && importMutation.variables === profile.id ? (
                <>
                  <LoaderIcon className="size-3.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <DownloadIcon className="size-3.5" />
                  Import
                </>
              )}
            </Button>
          </div>
        ))}
      </SettingRows>
      {disabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Enable the browser tool to import Chrome profiles.
        </p>
      ) : null}
      {importMutation.isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Copying Chrome profile data. This may take a few seconds...
        </p>
      ) : null}
    </>
  );
}

function HeadlessToggle({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const headless = settings['browser.headless'] !== 'false';

  const saveMutation = useMutation(
    saveSettingMutationOptions('browser.headless', queryClient, { silent: true }),
  );

  function handleToggle(checked: boolean) {
    if (disabled) return;
    saveMutation.mutate(checked ? 'true' : 'false');
  }

  return (
    <SettingRow
      label="Headless mode"
      description="Run the browser in the background without a visible window"
      htmlFor="headless-toggle"
      className={cn(disabled && 'opacity-60')}
    >
      <Switch
        id="headless-toggle"
        checked={headless}
        onCheckedChange={handleToggle}
        disabled={disabled || saveMutation.isPending}
      />
    </SettingRow>
  );
}

function BrowserToolsetToggle({
  enabled,
  isMutating,
  onToggle,
}: {
  enabled: boolean;
  isMutating: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <SettingRow
      label="Enable browser tool"
      description={`Browser Toolset ${enabled ? 'Active' : 'Inactive'}`}
      htmlFor="browser-toolset-toggle"
    >
      <Switch
        id="browser-toolset-toggle"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={isMutating}
      />
    </SettingRow>
  );
}

export function BrowserSettings() {
  const isMac = window.electron?.platform === 'darwin';
  const { data: enabledStates } = useSuspenseQuery(toolEnabledStatesQueryOptions);
  const setToolEnabledState = useSetToolEnabledState();
  const browserToolEnabled =
    enabledStates.find(
      (state) => state.scope === 'toolset' && state.identifier === BROWSER_TOOLSET_ID,
    )?.enabled ?? true;

  function handleBrowserToolsetToggle(checked: boolean) {
    void setToolEnabledState
      .mutateAsync({ scope: 'toolset', identifier: BROWSER_TOOLSET_ID, enabled: checked })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update browser tool');
      });
  }

  return (
    <SettingPage title="Browser" description="Configure the browser used by Stitch">
      <SettingSection>
        <SettingRows>
          <BrowserToolsetToggle
            enabled={browserToolEnabled}
            isMutating={setToolEnabledState.isPending}
            onToggle={handleBrowserToolsetToggle}
          />
          <React.Suspense fallback={<SettingLoading />}>
            <HeadlessToggle disabled={!browserToolEnabled} />
          </React.Suspense>
        </SettingRows>
      </SettingSection>

      {isMac ? (
        <>
          <SettingSection
            title="Chrome Profile"
            className={cn(!browserToolEnabled && 'opacity-70')}
          >
            <p className="text-xs text-muted-foreground">
              Import your Chrome profile to use your existing logins, cookies, and sessions. This
              copies your profile data into the Stitch browser and fully replaces any previous
              import.
            </p>
            <React.Suspense fallback={<SettingLoading />}>
              <ProfileStatus />
            </React.Suspense>
          </SettingSection>

          <SettingSection title="Available Profiles">
            <React.Suspense
              fallback={<div className="text-sm text-muted-foreground">Loading profiles...</div>}
            >
              <ProfileList disabled={!browserToolEnabled} />
            </React.Suspense>
          </SettingSection>
        </>
      ) : null}
    </SettingPage>
  );
}
