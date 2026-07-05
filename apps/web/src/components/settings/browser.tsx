import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingRows, SettingSection } from '@/components/settings/settings-ui';

export function BrowserSettings() {
  const page = SETTINGS_PAGE_BY_ID.browser;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <SettingSection title="App">
        <SettingRows>
          <AppEnableSetting appId="browser" label="Browser" />
        </SettingRows>
      </SettingSection>
    </SettingPage>
  );
}
