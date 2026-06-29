import { Link, useRouterState } from '@tanstack/react-router';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { SETTINGS_PAGES, SETTINGS_SECTIONS } from '@/components/settings/settings-metadata';

export function SettingsSidebarContent() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <InternalSidebar.Content>
      {SETTINGS_SECTIONS.map((section) => (
        <InternalSidebar.Section key={section} title={section}>
          {SETTINGS_PAGES.filter(
            (page) => page.section === section && page.id !== 'connection',
          ).map((page) => {
            const Icon = page.icon;
            const active = currentPath === page.to;
            return (
              <InternalSidebar.SectionItem
                key={page.id}
                isActive={active}
                render={<Link to={page.to} preload="intent" />}
              >
                <Icon className="size-4" />
                <span>{page.label}</span>
              </InternalSidebar.SectionItem>
            );
          })}
        </InternalSidebar.Section>
      ))}
    </InternalSidebar.Content>
  );
}
