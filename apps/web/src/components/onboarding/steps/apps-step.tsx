import { useQuery } from '@tanstack/react-query';

import { APP_IDS, type AppId } from '@stitch/shared/apps/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
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
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-space-2xl">
      <div className="space-y-space-m text-center">
        <Text variant="heading-l">Choose your mini-apps</Text>
        <Text variant="body" tone="muted">
          Pick what should appear in Stitch. You can change these later in Settings.
        </Text>
      </div>

      <div className="space-y-space-l">
        {APP_IDS.map((appId) => {
          const page = SETTINGS_PAGE_BY_ID[appId];
          const PageIcon = page.icon;
          const toggleId = `onboarding-${appId}-app-toggle`;
          return (
            <div
              key={appId}
              className="flex items-center justify-between gap-space-xl rounded-xl border border-border-subtle bg-card px-space-xl py-space-l">
              <div className="flex min-w-0 items-start gap-space-l">
                <div className="mt-space-2xs flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon as={PageIcon} size="m" tone="muted" />
                </div>
                <div className="min-w-0">
                  <label htmlFor={toggleId}>
                    <Text as="span" variant="body-strong">
                      {page.label}
                    </Text>
                  </label>
                  <div className="mt-space-xs">
                    <Text variant="body" tone="muted">
                      {page.description}
                    </Text>
                  </div>
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

      <Stack direction="row" justify="center" gap="m">
        <Button variant="outline" onClick={onContinue} disabled={setAppEnabledState.isPending}>
          Skip
        </Button>
        <Button onClick={onContinue} disabled={setAppEnabledState.isPending}>
          Continue
        </Button>
      </Stack>
    </div>
  );
}
