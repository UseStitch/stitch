import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import { AppSidebar } from '@/components/app-sidebar';
import { CommandPalette } from '@/components/command-palette';
import { TitleBar } from '@/components/layout/title-bar';
import { RenameSessionDialog } from '@/components/rename-session-dialog';
import { RightClickMenu } from '@/components/right-click-menu';
import { SettingsDialog } from '@/components/settings-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { DialogProvider } from '@/context/dialog-context';
import { StreamSync } from '@/hooks/sse/use-stream-sync';
import { useTheme } from '@/hooks/ui/use-theme';
import { useActions } from '@/lib/actions';
import { providersQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';
import { useGlobalHotkeys } from '@/lib/use-global-hotkeys';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(shortcutsQueryOptions),
      context.queryClient.ensureQueryData(providersQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
});

function RootLayout() {
  const actions = useActions();
  useGlobalHotkeys(actions);
  useTheme();

  return (
    <SidebarProvider className="h-screen flex-col overflow-hidden">
      <TitleBar />
      <RightClickMenu>
        <div className="relative flex flex-1 overflow-hidden bg-sidebar">
          <AppSidebar />
          <SidebarInset className="bg-muted rounded-tl-2xl border-l border-border/50 overflow-hidden shadow-sm">
            <StreamSync />
            <Outlet />
          </SidebarInset>
        </div>
      </RightClickMenu>
      <CommandPalette />
      <SettingsDialog />
      <RenameSessionDialog />
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}

function RootComponent() {
  return (
    <DialogProvider>
      <RootLayout />
    </DialogProvider>
  );
}
