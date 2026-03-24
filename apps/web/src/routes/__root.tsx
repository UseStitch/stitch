import { z } from 'zod';

import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import { ActivityBar } from '@/components/activity-bar';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandPalette } from '@/components/command-palette';
import { TitleBar } from '@/components/layout/title-bar';
import { OnboardingDialog } from '@/components/onboarding-dialog';
import { RecordingBanner } from '@/components/recording-banner/recording-banner';
import { RenameSessionDialog } from '@/components/rename-session-dialog';
import { RightClickMenu } from '@/components/right-click-menu';
import { SettingsDialog } from '@/components/settings-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { DialogProvider } from '@/context/dialog-context';
import { MeetingSync } from '@/hooks/sse/use-meeting-sync';
import { NotificationSound } from '@/hooks/sse/use-notification-sound';
import { StreamSync } from '@/hooks/sse/use-stream-sync';
import { UnreadSync } from '@/hooks/sse/use-unread-sync';
import { useTheme } from '@/hooks/ui/use-theme';
import { useActions } from '@/lib/actions';
import { providersQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';
import { useGlobalHotkeys } from '@/lib/use-global-hotkeys';

interface RouterContext {
  queryClient: QueryClient;
}

const settingsSearchSchema = z.object({
  settings: z
    .enum([
      'general',
      'appearance',
      'shortcuts',
      'key-locations',
      'providers',
      'models',
      'agents',
      'mcp-servers',
    ])
    .optional(),
});

export type SettingsTab = z.infer<typeof settingsSearchSchema>['settings'];

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  validateSearch: settingsSearchSchema,
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
      <div className="flex flex-1 overflow-hidden">
        {/* Activity bar: full height, merges with title bar background */}
        <ActivityBar />

        {/* Right side: title bar on top, sidebar + content below */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TitleBar />
          <RightClickMenu>
            <div className="relative flex flex-1 overflow-hidden bg-sidebar">
              <AppSidebar />
              <SidebarInset className="overflow-hidden border-l border-border/50 bg-muted shadow-sm peer-data-[state=expanded]:rounded-tl-2xl">
                <StreamSync />
                <NotificationSound />
                <UnreadSync />
                <MeetingSync />
                <RecordingBanner />
                <Outlet />
              </SidebarInset>
            </div>
          </RightClickMenu>
        </div>
      </div>
      <CommandPalette />
      <SettingsDialog />
      <OnboardingDialog />
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
