import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { useActions } from '@/lib/actions';
import { useGlobalHotkeys } from '@/lib/use-global-hotkeys';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';
import { providersQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { DialogProvider } from '@/context/dialog-context';
import { useTheme } from '@/hooks/ui/use-theme';
import { TitleBar } from "@/components/layout/title-bar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { SettingsDialog } from "@/components/settings-dialog";
import { RenameSessionDialog } from "@/components/rename-session-dialog";
import { Toaster } from "@/components/ui/sonner";
import { ChatStreamProvider } from "@/context/chat-stream-context";
import { RightClickMenu } from '@/components/right-click-menu';

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
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar />
          <SidebarInset className="bg-muted rounded-tl-2xl border-l border-border/50 overflow-hidden shadow-sm">
            <ChatStreamProvider>
              <Outlet />
            </ChatStreamProvider>
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
