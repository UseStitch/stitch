import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

import { Text } from '@/components/primitives/text';
import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { EligibleAccountsSection } from '@/components/settings/mail/eligible-accounts-section.js';
import { EnrolledAccountsSection } from '@/components/settings/mail/enrolled-accounts-section.js';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingRows, SettingSection, SwitchSettingRow } from '@/components/settings/settings-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/errors';
import { mailAccountsQueryOptions, mailSyncStatusQueryOptions } from '@/lib/queries/mail';
import { settingsQueryOptions } from '@/lib/queries/settings';

export function MailSettings() {
  const page = SETTINGS_PAGE_BY_ID.mail;
  const { data: accounts, isLoading, error } = useQuery(mailAccountsQueryOptions);
  const { data: statuses } = useQuery(mailSyncStatusQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  return (
    <SettingPage title={page.title} description={page.description} icon={<page.icon />}>
      <Tabs defaultValue="accounts" className="space-y-space-xl">
        <TabsList variant="line">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="enrolled">Enrolled accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <SettingSection className="mt-space-none">
            <AppEnableSetting appId="mail" label="Mail" />
          </SettingSection>

          <SettingSection title="Message display" description="Control how messages render in Mail.">
            <SettingRows>
              <SwitchSettingRow
                settingKey="mail.alwaysLoadRemoteImages"
                label="Always load remote images"
                description="Automatically load remote images in message bodies instead of showing a per-message load button."
                checked={settings['mail.alwaysLoadRemoteImages'] !== 'false'}
              />
            </SettingRows>
          </SettingSection>

          <SettingSection
            title="Add account"
            description="Eligible connected Google accounts that are not already enrolled.">
            <EligibleAccountsSection />
          </SettingSection>
        </TabsContent>

        <TabsContent value="enrolled">
          <SettingSection title="Enrolled accounts" description="Manage local Gmail sync settings per account.">
            {isLoading ? <Text tone="muted">Loading mail accounts...</Text> : null}
            {error ? <Text tone="destructive">{getErrorMessage(error, 'Failed to load mail accounts')}</Text> : null}
            {accounts ? <EnrolledAccountsSection accounts={accounts} statuses={statuses} /> : null}
          </SettingSection>
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}
