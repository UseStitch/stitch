import * as React from 'react';

import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouter } from '@tanstack/react-router';

import type { AppearanceMode } from '@stitch/shared/appearance/types';

import { TitleBar } from '@/components/layout/title-bar';
import { ActivityBar } from '@/components/navigation/activity-bar';
import { AppSidebar } from '@/components/navigation/app-sidebar';
import { CommandPalette } from '@/components/navigation/command-palette';
import { RightClickMenu } from '@/components/navigation/right-click-menu';
import { OnboardingDialog } from '@/components/onboarding/onboarding-dialog';
import {
  MeetingRecordingBanner,
  RecordingEventListener,
} from '@/components/recordings/meeting-recording-banner';
import { RenameSessionDialog } from '@/components/rename-session-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { DialogProvider } from '@/context/dialog-context';
import { ServerEventSync } from '@/hooks/sse/server-event-sync';
import { useTheme } from '@/hooks/ui/use-theme';
import { UpdaterSync } from '@/hooks/ui/use-updater-sync';
import { useActions } from '@/lib/actions';
import { resetServerUrlCache } from '@/lib/api';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';
import {
  applyAppearanceMode,
  DEFAULT_MODE,
  DEFAULT_THEME,
  getTheme,
  injectThemeCss,
  removeSplash,
} from '@/lib/theme';
import { useGlobalHotkeys } from '@/lib/use-global-hotkeys';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(shortcutsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
});

function RootLayout() {
  const actions = useActions();
  useGlobalHotkeys(actions);
  useTheme();

  React.useEffect(() => {
    // Wait two frames so the themed first paint lands before the splash fades,
    // otherwise a bare frame can flash between splash removal and the real UI.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => removeSplash());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

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
                <ServerEventSync />
                <RecordingEventListener />
                <UpdaterSync />
                <ServerConnectionSync />
                <MeetingRecordingBanner />
                <Outlet />
              </SidebarInset>
            </div>
          </RightClickMenu>
        </div>
      </div>
      <CommandPalette actions={actions} />
      <OnboardingDialog />
      <RenameSessionDialog />
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}

function ServerConnectionSync() {
  const router = useRouter();

  React.useEffect(() => {
    return window.api?.server?.onConfigChanged((config) => {
      resetServerUrlCache(config.url);

      void router.navigate({ to: '/settings/connection' }).then(async () => {
        router.options.context.queryClient.clear();
        const settings =
          await router.options.context.queryClient.ensureQueryData(settingsQueryOptions);
        injectThemeCss(getTheme(settings['appearance.theme'] ?? DEFAULT_THEME));
        applyAppearanceMode(
          (settings['appearance.mode'] as AppearanceMode | undefined) ?? DEFAULT_MODE,
        );
        void router.invalidate();
      });

      window.dispatchEvent(new Event('server-config-changed'));
    });
  }, [router]);

  return null;
}

function RootComponent() {
  return (
    <DialogProvider>
      <RootLayout />
    </DialogProvider>
  );
}
