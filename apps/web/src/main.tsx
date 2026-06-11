import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createHashHistory, createRouter } from '@tanstack/react-router';

import { DesktopNotificationRoot } from '@/components/desktop-notifications/desktop-notification-root';
import { SseProvider } from '@/hooks/sse/sse-context';
import { applyAppearanceMode, DEFAULT_THEME, getTheme, injectThemeCss } from '@/lib/theme';
import { routeTree } from '@/routeTree.gen';
import '@/styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});
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

const rootElement = document.getElementById('root')!;
const isDesktopNotificationWindow = window.location.hash.startsWith('#/desktop-notifications');

if (isDesktopNotificationWindow) {
  injectThemeCss(getTheme(DEFAULT_THEME));
  applyAppearanceMode('light');
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
