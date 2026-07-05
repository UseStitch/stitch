import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingRows, SettingSection } from '@/components/settings/settings-ui';

export function AgendaSettings() {
  const page = SETTINGS_PAGE_BY_ID.agenda;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <SettingSection title="App">
        <SettingRows>
          <AppEnableSetting appId="agenda" label="Agenda" />
        </SettingRows>
      </SettingSection>
    </SettingPage>
  );
}
