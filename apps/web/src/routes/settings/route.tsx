import { createFileRoute, Outlet } from '@tanstack/react-router';

import { Page, PageContent } from '@/components/ui/page';

export const Route = createFileRoute('/settings')({ component: SettingsRoute });

function SettingsRoute() {
  return (
    <Page>
      <PageContent>
        <Outlet />
      </PageContent>
    </Page>
  );
}
