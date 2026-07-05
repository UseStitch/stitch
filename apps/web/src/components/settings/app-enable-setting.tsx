import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { AppId } from '@stitch/shared/apps/types';

import { SettingRow } from '@/components/settings/settings-ui';
import { Switch } from '@/components/ui/switch';
import { appEnabledStatesQueryOptions, useSetAppEnabledState } from '@/lib/queries/apps';

export function AppEnableSetting({ appId, label }: { appId: AppId; label: string }) {
  const { data: enabledStates } = useSuspenseQuery(appEnabledStatesQueryOptions);
  const setAppEnabledState = useSetAppEnabledState();
  const enabled = enabledStates.find((state) => state.appId === appId)?.enabled ?? true;
  const toggleId = `${appId}-app-toggle`;

  function handleToggle(checked: boolean) {
    void setAppEnabledState.mutateAsync({ appId, enabled: checked }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : `Failed to update ${label}`, { id: 'app-enable' });
    });
  }

  return (
    <SettingRow
      label={`Enable ${label}`}
      description={`${label} is ${enabled ? 'visible and available to the agent' : 'hidden and unavailable to the agent'}.`}
      htmlFor={toggleId}>
      <Switch id={toggleId} checked={enabled} onCheckedChange={handleToggle} disabled={setAppEnabledState.isPending} />
    </SettingRow>
  );
}
