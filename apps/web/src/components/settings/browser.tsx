import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingRow,
  SettingRows,
  SettingSection,
} from '@/components/settings/settings-ui';
import { Switch } from '@/components/ui/switch';
import { toolEnabledStatesQueryOptions, useSetToolEnabledState } from '@/lib/queries/tools';

const BROWSER_TOOLSET_ID = 'browser';

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
  const page = SETTINGS_PAGE_BY_ID.browser;
  const Icon = page.icon;
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
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <SettingSection>
        <SettingRows>
          <BrowserToolsetToggle
            enabled={browserToolEnabled}
            isMutating={setToolEnabledState.isPending}
            onToggle={handleBrowserToolsetToggle}
          />
        </SettingRows>
      </SettingSection>

      <SettingSection title="In-app browser profile">
        <p className="text-sm text-muted-foreground">
          Stitch now uses a built-in Electron browser. Sign in manually inside the browser panel;
          cookies, localStorage, IndexedDB, and cache persist across app restarts in one shared
          Stitch browser profile.
        </p>
      </SettingSection>

      <SettingSection title="Downloads">
        <p className="text-sm text-muted-foreground">
          Browser downloads are saved to ~/.stitch/downloads and shown at the bottom of the browser
          panel.
        </p>
      </SettingSection>
    </SettingPage>
  );
}
