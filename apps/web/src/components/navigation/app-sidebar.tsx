import { useRouterState } from '@tanstack/react-router';

import { AgendaSidebarContent } from '@/components/agenda/agenda-sidebar';
import { AutomationsSidebarContent } from '@/components/automations/automations-sidebar';
import { ChatSidebarContent } from '@/components/chat/chat-sidebar';
import { RecordingsSidebarContent } from '@/components/recordings/recordings-sidebar';
import { SettingsSidebarContent } from '@/components/settings/settings-nav';
import { Sidebar } from '@/components/ui/sidebar';

const HIDDEN_SIDEBAR_PATHS = ['/connectors', '/memories', '/usage'] as const;

const SIDEBAR_CONTENT = [
  { path: '/settings', content: <SettingsSidebarContent /> },
  { path: '/automations', content: <AutomationsSidebarContent /> },
  { path: '/recordings', content: <RecordingsSidebarContent /> },
  { path: '/agenda', content: <AgendaSidebarContent /> },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  if (HIDDEN_SIDEBAR_PATHS.some((hiddenPath) => path.startsWith(hiddenPath))) {
    return null;
  }

  const content = SIDEBAR_CONTENT.find((item) => path.startsWith(item.path))?.content ?? (
    <ChatSidebarContent />
  );

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      {content}
    </Sidebar>
  );
}
