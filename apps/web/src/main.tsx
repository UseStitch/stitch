import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createHashHistory, createRouter } from '@tanstack/react-router';

import { DesktopNotificationRoot } from '@/components/desktop-notifications/desktop-notification-root';
import { SseProvider } from '@/hooks/sse/sse-context';
import { initClientTelemetry, captureClientEvent } from '@/lib/telemetry/client';
import { applyAppearanceMode, applyTheme, DEFAULT_MODE, DEFAULT_THEME, getTheme } from '@/lib/theme';
import { routeTree } from '@/routeTree.gen';
import '@/styles/global.css';

if (!('api' in window)) throw new Error('Desktop bridge (window.api) is not available');

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
const isFileProtocol = window.location.protocol === 'file:';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultStructuralSharing: true,
  ...(isFileProtocol ? { history: createHashHistory() } : {}),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const isDesktopNotificationWindow = window.location.hash.startsWith('#/desktop-notifications');

if (isDesktopNotificationWindow) {
  applyTheme(getTheme(DEFAULT_THEME));
  applyAppearanceMode(DEFAULT_MODE);
  document.getElementById('stitch-splash')?.remove();
}

// Initialize telemetry (non-blocking, best-effort)
if (!isDesktopNotificationWindow) {
  void initClientTelemetry().then(() => {
    captureClientEvent('app_active', { connection_mode: 'local' });
  });
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isDesktopNotificationWindow ? (
        <DesktopNotificationRoot />
      ) : (
        <HotkeysProvider>
          <SseProvider>
            <RouterProvider router={router} />
          </SseProvider>
        </HotkeysProvider>
      )}
    </QueryClientProvider>
  </StrictMode>,
);
