import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createHashHistory, createRouter } from '@tanstack/react-router';

import { SseProvider } from '@/hooks/sse/sse-context';
import { routeTree } from '@/routeTree.gen';
import '@/styles/global.css';

const queryClient = new QueryClient();
const isFileProtocol = window.location.protocol === 'file:';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  ...(isFileProtocol ? { history: createHashHistory() } : {}),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root')!;

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <SseProvider>
          <RouterProvider router={router} />
        </SseProvider>
      </HotkeysProvider>
    </QueryClientProvider>
  </StrictMode>,
);
