import { useQuery } from '@tanstack/react-query';

import { AppEnableSetting } from '@/components/settings/app-enable-setting';
import { EligibleAccountsSection } from '@/components/settings/mail/eligible-accounts-section.js';
import { EnrolledAccountsSection } from '@/components/settings/mail/enrolled-accounts-section.js';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/errors';
import { mailAccountsQueryOptions, mailSyncStatusQueryOptions } from '@/lib/queries/mail';

export function MailSettings() {
  const page = SETTINGS_PAGE_BY_ID.mail;
  const { data: accounts, isLoading, error } = useQuery(mailAccountsQueryOptions);
  const { data: statuses } = useQuery(mailSyncStatusQueryOptions);

  return (
    <SettingPage title={page.title} description={page.description} icon={<page.icon />}>
      <Tabs defaultValue="accounts" className="space-y-5">
        <TabsList variant="line">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="enrolled">Enrolled accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <SettingSection className="mt-0">
            <AppEnableSetting appId="mail" label="Mail" />
          </SettingSection>

          <SettingSection
            title="Add account"
            description="Eligible connected Google accounts that are not already enrolled.">
            <EligibleAccountsSection />
          </SettingSection>
        </TabsContent>

        <TabsContent value="enrolled">
          <SettingSection title="Enrolled accounts" description="Manage local Gmail sync settings per account.">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading mail accounts...</p> : null}
            {error ? (
              <p className="text-sm text-destructive">{getErrorMessage(error, 'Failed to load mail accounts')}</p>
            ) : null}
            {accounts ? <EnrolledAccountsSection accounts={accounts} statuses={statuses} /> : null}
          </SettingSection>
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}
