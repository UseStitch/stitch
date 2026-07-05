import { useQuery } from '@tanstack/react-query';

import { APP_IDS, type AppId } from '@stitch/shared/apps/types';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { appEnabledStatesQueryOptions, useSetAppEnabledState } from '@/lib/queries/apps';

type Props = { onContinue: () => void };

export function AppsStep({ onContinue }: Props) {
  const { data: appEnabledStates } = useQuery(appEnabledStatesQueryOptions);
  const setAppEnabledState = useSetAppEnabledState();

  function isEnabled(appId: AppId): boolean {
    return appEnabledStates?.find((state) => state.appId === appId)?.enabled ?? true;
  }

  function handleToggle(appId: AppId, enabled: boolean) {
    setAppEnabledState.mutate({ appId, enabled });
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Choose your mini-apps</h2>
        <p className="text-sm text-muted-foreground">
          Pick what should appear in Stitch. You can change these later in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {APP_IDS.map((appId) => {
          const page = SETTINGS_PAGE_BY_ID[appId];
          const Icon = page.icon;
          const toggleId = `onboarding-${appId}-app-toggle`;
          return (
            <div
              key={appId}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-card px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <label htmlFor={toggleId} className="text-sm font-medium">
                    {page.label}
                  </label>
                  <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
                </div>
              </div>
              <Switch
                id={toggleId}
                checked={isEnabled(appId)}
                disabled={setAppEnabledState.isPending}
                onCheckedChange={(checked) => handleToggle(appId, checked)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={onContinue} disabled={setAppEnabledState.isPending}>
          Skip
        </Button>
        <Button onClick={onContinue} disabled={setAppEnabledState.isPending}>
          Continue
        </Button>
      </div>
    </div>
  );
}
