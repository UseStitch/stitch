import { useRouterState } from '@tanstack/react-router';

import { AgendaSidebarContent } from '@/components/agenda/agenda-sidebar';
import { AutomationsSidebarContent } from '@/components/automations/automations-sidebar';
import { ChatSidebarContent } from '@/components/chat/chat-sidebar';
import { RecordingsSidebarContent } from '@/components/recordings/recordings-sidebar';
import { SettingsNav } from '@/components/settings/settings-nav';
import { Sidebar } from '@/components/ui/sidebar';

function useActiveContext():
  | 'chat'
  | 'connectors'
  | 'automations'
  | 'memories'
  | 'usage'
  | 'recordings'
  | 'agenda'
  | 'settings' {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path.startsWith('/connectors')) return 'connectors';
  if (path.startsWith('/automations')) return 'automations';
  if (path.startsWith('/memories')) return 'memories';
  if (path.startsWith('/usage')) return 'usage';
  if (path.startsWith('/recordings')) return 'recordings';
  if (path.startsWith('/agenda')) return 'agenda';
  if (path.startsWith('/settings')) return 'settings';

  return 'chat';
}

export function AppSidebar() {
  const context = useActiveContext();

  if (context === 'connectors' || context === 'memories' || context === 'usage') {
    return null;
  }

  if (context === 'settings') {
    return <SettingsNav />;
  }

  const content =
    context === 'automations' ? (
      <AutomationsSidebarContent />
    ) : context === 'recordings' ? (
      <RecordingsSidebarContent />
    ) : context === 'agenda' ? (
      <AgendaSidebarContent />
    ) : (
      <ChatSidebarContent />
    );

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      {content}
    </Sidebar>
  );
}
